import { timeAgo } from '../lib/format';
import type { Commit, Contributions, GitHubSnapshot } from '../lib/github';
import {
  calendarWeeks,
  contributionsLabel,
  describeDay,
  formatDay,
  monthLabels,
  number,
} from '../lib/github-view';

/**
 * Keeps the GitHub tiles current between builds. The static page shows what
 * GitHub looked like at build time; this swaps in the Worker's copy, which is
 * never more than ten minutes old.
 */

/** "3 hours ago" labels are only true when the page is built, so redo them here. */
function refreshRelativeTimes(): void {
  for (const time of document.querySelectorAll<HTMLTimeElement>('time[data-relative]')) {
    time.textContent = timeAgo(new Date(time.dateTime));
  }
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderContributions(contributions: Contributions): void {
  const months = document.querySelector<HTMLElement>('[data-calendar-months]');
  const cells = document.querySelector<HTMLElement>('[data-calendar-cells]');
  if (!months || !cells) return;

  const weeks = calendarWeeks(contributions.days);
  months.replaceChildren(...monthLabels(weeks).map((label) => element('span', '', label)));
  cells.replaceChildren(
    ...weeks.flatMap((week) =>
      week.map((day) => {
        if (!day) return element('span', 'cell empty');
        const cell = element('span', `cell level-${day.level}`);
        cell.title = describeDay(day);
        return cell;
      }),
    ),
  );
  cells.setAttribute('aria-label', contributionsLabel(contributions.total));

  const stats: Record<string, string> = {
    total: number.format(contributions.total),
    longest: String(contributions.longestStreak),
    current: String(contributions.currentStreak),
    busiest: contributions.busiest ? String(contributions.busiest.count) : '—',
    'busiest-date': contributions.busiest ? formatDay(contributions.busiest.date) : '',
  };
  for (const [name, value] of Object.entries(stats)) {
    const target = document.querySelector<HTMLElement>(`[data-stat="${name}"]`);
    if (target) target.textContent = value;
  }

  // Keep the newest weeks in view on screens where the calendar scrolls.
  const calendar = document.querySelector<HTMLElement>('[data-calendar]');
  if (calendar) calendar.scrollLeft = calendar.scrollWidth;
}

function renderCommits(commits: Commit[]): void {
  const list = document.querySelector<HTMLElement>('[data-commits]');
  if (!list) return;

  list.replaceChildren(
    ...commits.map((commit) => {
      const link = element('a', 'commit');
      link.href = commit.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';

      const time = element('time', '', timeAgo(new Date(commit.date)));
      time.dateTime = commit.date;
      time.dataset.relative = '';

      const meta = element('span', 'meta');
      meta.append(element('span', 'repo', commit.repo), element('span', 'sha', commit.sha), time);
      link.append(element('span', 'message', commit.message), meta);

      const item = document.createElement('li');
      item.append(link);
      return item;
    }),
  );
}

export async function startGitHubLive(): Promise<void> {
  refreshRelativeTimes();
  setInterval(refreshRelativeTimes, 60_000);

  try {
    const response = await fetch('/api/github');
    if (!response.ok) return;
    const snapshot = (await response.json()) as GitHubSnapshot;
    if (snapshot.contributions) renderContributions(snapshot.contributions);
    if (snapshot.commits.length > 0) renderCommits(snapshot.commits);
  } catch {
    // The build-time tiles stay as they are.
  }
}
