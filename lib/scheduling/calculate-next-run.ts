import { addDays, addHours, addMonths } from "date-fns";

export function calculateNextRun(frequency: string, from: Date): Date {
  switch (frequency) {
    case "daily":     return addDays(from, 1);
    case "weekly":    return addDays(from, 7);
    case "3x_weekly": return addDays(from, Math.ceil(7 / 3));
    case "2x_daily":  return addHours(from, 12);
    case "monthly":   return addMonths(from, 1);
    default:          return addDays(from, 7);
  }
}
