/**
 * How a report's period label reads ("2026-W47" -> "Week 47, 2026 (16 – 22 Nov)"; "2026-11" -> "November 2026"), with
 * nothing but the label: no time zone, no database, so the Reports page (a client page) uses the same words as the PDF
 * and the file names. S02 part 0B (LLD amendment 73) moved it here from lib/reports/report-period.ts, which re-exports it.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export interface ReportPeriodDisplay {
  /** "Week 44, 2026" or "October 2026". */
  title: string;
  /** "26 Oct – 1 Nov"; null for a month, or a label that isn't a week. */
  range: string | null;
  /** "Week 44, 2026 (26 Oct – 1 Nov)". */
  full: string;
}

/** Monday of ISO week `week` of ISO week-year `year`, as a UTC calendar date. */
function isoWeekMonday(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Weekday = jan4.getUTCDay() || 7; // Monday = 1 ... Sunday = 7
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Weekday - 1) + (week - 1) * 7);
  return monday;
}

function dayMonth(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** How a period label reads in a report: "Week 44, 2026 (26 Oct – 1 Nov)". */
export function reportPeriodDisplay(label: string): ReportPeriodDisplay {
  const week = /^(\d{4})-W(\d{2})$/.exec(label);
  if (week) {
    const year = Number(week[1]);
    const n = Number(week[2]);
    const monday = isoWeekMonday(year, n);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const range =
      monday.getUTCMonth() === sunday.getUTCMonth()
        ? `${monday.getUTCDate()} – ${dayMonth(sunday)}`
        : `${dayMonth(monday)} – ${dayMonth(sunday)}`;
    const title = `Week ${n}, ${year}`;
    return { title, range, full: `${title} (${range})` };
  }
  const month = /^(\d{4})-(\d{2})$/.exec(label);
  if (month) {
    const title = `${MONTHS_LONG[Number(month[2]) - 1]} ${month[1]}`;
    return { title, range: null, full: title };
  }
  return { title: label, range: null, full: label };
}
