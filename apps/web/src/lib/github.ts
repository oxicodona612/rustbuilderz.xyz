/**
 * GitHub data for the page. The build reads it for the static HTML, and the
 * Worker reads it again behind `/api/github` so the page stays current between
 * builds. Every function resolves to null or an empty list on failure, so a
 * GitHub outage only hides parts of the page.
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

/** Everything the live tiles need, as served by `/api/github`. */
export interface GitHubSnapshot {
  contributions: Contributions | null;
  commits: Commit[];
  fetchedAt: string;
}

export interface GitHubOptions {
  /** Optional. Raises the API rate limit from 60 to 5,000 requests an hour. */
  token?: string | undefined;
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
// GitHub refuses API requests without a User-Agent, and Workers send none.
const USER_AGENT = 'rustbuilderz.xyz';

async function api<T>(path: string, { token }: GitHubOptions): Promise<T | null> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': USER_AGENT,
    'x-github-api-version': '2022-11-28',
  };
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

export async function fetchRepoStats(
  fullName: string,
  options: GitHubOptions = {},
): Promise<RepoStats | null> {
  const repo = await api<GitHubRepo>(`/repos/${fullName}`, options);
  return (
    repo && {
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      pushedAt: repo.pushed_at,
      url: repo.html_url,
    }
  );
}

/** The latest commits across the user's most recently pushed repositories. */
export async function fetchRecentCommits(
  username: string,
  limit = 6,
  options: GitHubOptions = {},
): Promise<Commit[]> {
  const repos = await api<GitHubRepo[]>(
    `/users/${username}/repos?type=owner&sort=pushed&per_page=10`,
    options,
  );
  const active = (repos ?? []).filter((repo) => !repo.fork).slice(0, 4);

  const perRepo = await Promise.all(
    active.map(async (repo) => {
      const commits = await api<GitHubCommit[]>(
        `/repos/${repo.full_name}/commits?per_page=${limit}`,
        options,
      );
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
export async function fetchContributions(username: string): Promise<Contributions | null> {
  let html: string;
  try {
    const response = await fetch(`https://github.com/users/${username}/contributions`, {
      headers: { 'user-agent': USER_AGENT },
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
}

export async function fetchSnapshot(
  username: string,
  options: GitHubOptions = {},
): Promise<GitHubSnapshot> {
  const [contributions, commits] = await Promise.all([
    fetchContributions(username),
    fetchRecentCommits(username, 6, options),
  ]);
  return { contributions, commits, fetchedAt: new Date().toISOString() };
}
