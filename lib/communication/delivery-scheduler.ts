import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import { reportDeliverySchedules } from "@/db/schema";
import type { DbClient } from "@/db/client";

/* ---------- Zod schema for schedule creation ---------- */

export const createScheduleSchema = z
  .object({
    frequency: z.enum(["weekly", "monthly"]),
    day_of_week: z.number().int().min(0).max(6).optional(),
    day_of_month: z.number().int().min(1).max(28).optional(),
    time_of_day: z.string().default("23:00"),
    recipient_emails: z.array(z.email()).min(1),
    is_active: z.boolean().default(true),
    brand_id: z.string().uuid().optional(),
    template_id: z.string().uuid().optional(),
  })
  .refine((d) => d.frequency !== "weekly" || d.day_of_week != null, {
    message: "day_of_week required for weekly",
  })
  .refine((d) => d.frequency !== "monthly" || d.day_of_month != null, {
    message: "day_of_month required for monthly",
  });

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;

/* ---------- due-check helpers ---------- */

interface ScheduleRow {
  frequency: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  isActive: boolean;
}

/**
 * Checks whether a schedule is due at the given instant.
 *
 * - Weekly: UTC day-of-week matches schedule.dayOfWeek
 * - Monthly: UTC date matches schedule.dayOfMonth
 * - Time: current UTC HH:MM is within a 30-minute window of schedule.timeOfDay
 */
export function isScheduleDue(schedule: ScheduleRow, now: Date): boolean {
  if (!schedule.isActive) return false;

  // Day match
  if (schedule.frequency === "weekly") {
    if (schedule.dayOfWeek == null) return false;
    if (now.getUTCDay() !== schedule.dayOfWeek) return false;
  } else if (schedule.frequency === "monthly") {
    if (schedule.dayOfMonth == null) return false;
    if (now.getUTCDate() !== schedule.dayOfMonth) return false;
  } else {
    return false;
  }

  // Time-of-day match (within 30-minute window)
  return isWithinTimeWindow(schedule.timeOfDay, now, 30);
}

/**
 * Returns all active schedules that are currently due.
 * Filters active rows in SQL, then applies time-window check in JS.
 */
export async function getDueSchedules(
  tx: DbClient,
  now: Date,
): Promise<(typeof reportDeliverySchedules.$inferSelect)[]> {
  const activeRows = await tx
    .select()
    .from(reportDeliverySchedules)
    .where(eq(reportDeliverySchedules.isActive, true));

  return activeRows.filter((row) => isScheduleDue(row, now));
}

/* ---------- internal helpers ---------- */

function isWithinTimeWindow(
  timeOfDay: string,
  now: Date,
  windowMinutes: number,
): boolean {
  const [hoursStr, minutesStr] = timeOfDay.split(":");
  const scheduleHour = parseInt(hoursStr, 10);
  const scheduleMinute = parseInt(minutesStr, 10);

  if (isNaN(scheduleHour) || isNaN(scheduleMinute)) return false;

  const scheduleTotalMinutes = scheduleHour * 60 + scheduleMinute;
  const nowTotalMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  const diff = nowTotalMinutes - scheduleTotalMinutes;

  // Due if current time is within [0, windowMinutes) past the scheduled time
  return diff >= 0 && diff < windowMinutes;
}
