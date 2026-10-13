/**
 * GitHub data read at build time. Every function here resolves to null or an
 * empty list on failure, so a GitHub outage only hides parts of the page.
 */

export interface RepoStats {
  stars: number;
  forks: number;
  language: string | null;
  pushedAt: string;
  url: string;
}

export interface ContributionDay {
  date: string;
  count: number;
  /** GitHub's own 0–4 intensity bucket. */
  level: number;
}

export interface Contributions {
  days: ContributionDay[];
  total: number;
  longestStreak: number;
  currentStreak: number;
  busiest: ContributionDay | null;
}

export interface Commit {
  repo: string;
  sha: string;
  message: string;
  url: string;
  date: string;
}

interface GitHubRepo {
  full_name: string;
  name: string;
  html_url: string;
  fork: boolean;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  pushed_at: string;
}

interface GitHubCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { date: string } | null };
}

const TIMEOUT_MS = 10_000;
const cache = new Map<string, Promise<unknown>>();

/** Memoizes per build, so pages and components can ask for the same data freely. */
function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  let pending = cache.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = load();
    cache.set(key, pending);
  }
  return pending;
}

async function api<T>(path: string): Promise<T | null> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  // Optional. Raises the rate limit from 60 to 5,000 requests an hour.
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;

  try {
    const response = await fetch(`https://api.github.com${path}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[github] ${path}: HTTP ${response.status}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.warn(`[github] ${path}: ${(error as Error).message}`);
    return null;
  }
}

export function getRepoStats(fullName: string): Promise<RepoStats | null> {
  return once(`repo:${fullName}`, async () => {
    const repo = await api<GitHubRepo>(`/repos/${fullName}`);
    return (
      repo && {
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        pushedAt: repo.pushed_at,
        url: repo.html_url,
      }
    );
  });
}

/** The latest commits across the user's most recently pushed repositories. */
export function getRecentCommits(username: string, limit = 6): Promise<Commit[]> {
  return once(`commits:${username}`, async () => {
    const repos = await api<GitHubRepo[]>(
      `/users/${username}/repos?type=owner&sort=pushed&per_page=10`,
    );
    const active = (repos ?? []).filter((repo) => !repo.fork).slice(0, 4);

    const perRepo = await Promise.all(
      active.map(async (repo) => {
        const commits = await api<GitHubCommit[]>(`/repos/${repo.full_name}/commits?per_page=5`);
        return (commits ?? []).map((commit) => ({
          repo: repo.name,
          sha: commit.sha.slice(0, 7),
          message: commit.commit.message.split('\n')[0] ?? '',
          url: commit.html_url,
          date: commit.commit.author?.date ?? repo.pushed_at,
        }));
      }),
    );

    return perRepo
      .flat()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  });
}

function streaks(days: ContributionDay[]): { longest: number; current: number } {
  let longest = 0;
  let run = 0;
  for (const day of days) {
    run = day.count > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }

  // Today does not break the current streak until it is over.
  let current = 0;
  const lastIndex = days.length - 1;
  for (let index = lastIndex; index >= 0; index--) {
    const day = days[index]!;
    if (day.count > 0) current += 1;
    else if (index !== lastIndex) break;
  }
  return { longest, current };
}

/**
 * Reads the public contribution calendar, the same HTML fragment GitHub
 * renders on profiles. It needs no token, unlike the GraphQL API.
 */
export function getContributions(username: string): Promise<Contributions | null> {
  return once(`contributions:${username}`, async () => {
    let html: string;
    try {
      const response = await fetch(`https://github.com/users/${username}/contributions`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      html = await response.text();
    } catch (error) {
      console.warn(`[github] contributions for ${username}: ${(error as Error).message}`);
      return null;
    }

    // Each day is a <td> with a date and level; its count lives in a <tool-tip>.
    const tooltips = new Map<string, string>();
    for (const [, id, text] of html.matchAll(/<tool-tip[^>]*\bfor="([^"]+)"[^>]*>([^<]*)</g)) {
      if (id && text !== undefined) tooltips.set(id, text);
    }

    const days: ContributionDay[] = [];
    for (const [tag] of html.matchAll(/<td\b[^>]*\bdata-date="[^"]+"[^>]*>/g)) {
      const date = /\bdata-date="([^"]+)"/.exec(tag)?.[1];
      const id = /\bid="([^"]+)"/.exec(tag)?.[1];
      if (!date) continue;
      const text = (id && tooltips.get(id)) || '';
      const count = Number(/^([\d,]+) contribution/.exec(text)?.[1]?.replaceAll(',', '') ?? 0);
      const level = Number(/\bdata-level="(\d)"/.exec(tag)?.[1] ?? 0);
      days.push({ date, count, level });
    }
    if (days.length === 0) return null;

    days.sort((a, b) => a.date.localeCompare(b.date));
    const { longest, current } = streaks(days);
    const busiest = days.reduce<ContributionDay | null>(
      (best, day) => (day.count > (best?.count ?? 0) ? day : best),
      null,
    );

    return {
      days,
      total: days.reduce((sum, day) => sum + day.count, 0),
      longestStreak: longest,
      currentStreak: current,
      busiest,
    };
  });
}
