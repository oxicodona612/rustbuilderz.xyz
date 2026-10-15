/**
 * Presentation helpers shared by the server-rendered GitHub tiles and the
 * script that refreshes them in the browser, so both produce the same output.
 */

import type { ContributionDay } from './github';

export const number = new Intl.NumberFormat('en');

const dayFormat = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthFormat = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });

const parseDay = (date: string) => new Date(`${date}T00:00:00Z`);

/** "Oct 12, 2026" */
export const formatDay = (date: string) => dayFormat.format(parseDay(date));

/** "3 contributions on Oct 12, 2026", used as the cell tooltip. */
export function describeDay(day: ContributionDay): string {
  const count = day.count === 0 ? 'No' : number.format(day.count);
  return `${count} contribution${day.count === 1 ? '' : 's'} on ${formatDay(day.date)}`;
}

export const contributionsLabel = (total: number) =>
  `${number.format(total)} contributions in the last year`;

/** A calendar cell; null pads the first week before the calendar starts. */
export type CalendarCell = ContributionDay | null;

/** Columns are weeks starting on Sunday, like GitHub's own calendar. */
export function calendarWeeks(days: ContributionDay[]): CalendarCell[][] {
  const weeks: CalendarCell[][] = [];
  for (const day of days) {
    const weekday = parseDay(day.date).getUTCDay();
    if (weeks.length === 0 || weekday === 0) {
      weeks.push(Array.from<CalendarCell>({ length: weekday }).fill(null));
    }
    weeks.at(-1)!.push(day);
  }
  return weeks;
}

/**
 * One label per week column. A month's name sits over its first week (the one
 * whose first day is the 1st to the 7th), unless it would crowd the previous one.
 */
export function monthLabels(weeks: CalendarCell[][]): string[] {
  let lastLabelAt = -4;
  return weeks.map((week, index) => {
    const first = week.find((day) => day !== null);
    if (!first) return '';
    const date = parseDay(first.date);
    if (date.getUTCDate() > 7 || index - lastLabelAt < 4) return '';
    lastLabelAt = index;
    return monthFormat.format(date);
  });
}
