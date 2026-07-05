import { describe, expect, it } from "vitest";
import { createScheduleSchema, isScheduleDue } from "@/lib/communication/delivery-scheduler";

describe("createScheduleSchema — Zod refines (mutual exclusivity)", () => {
  it("weekly requires day_of_week", () => {
    const result = createScheduleSchema.safeParse({
      frequency: "weekly",
      recipient_emails: ["a@b.com"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i: { message: string }) => i.message);
      expect(messages).toContain("day_of_week required for weekly");
    }
  });

  it("monthly requires day_of_month", () => {
    const result = createScheduleSchema.safeParse({
      frequency: "monthly",
      recipient_emails: ["a@b.com"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i: { message: string }) => i.message);
      expect(messages).toContain("day_of_month required for monthly");
    }
  });

  it("weekly with day_of_week passes", () => {
    const result = createScheduleSchema.safeParse({
      frequency: "weekly",
      day_of_week: 1,
      recipient_emails: ["test@example.com"],
    });
    expect(result.success).toBe(true);
  });

  it("monthly with day_of_month passes", () => {
    const result = createScheduleSchema.safeParse({
      frequency: "monthly",
      day_of_month: 15,
      recipient_emails: ["test@example.com"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty recipient_emails", () => {
    const result = createScheduleSchema.safeParse({
      frequency: "weekly",
      day_of_week: 1,
      recipient_emails: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = createScheduleSchema.safeParse({
      frequency: "weekly",
      day_of_week: 1,
      recipient_emails: ["not-an-email"],
    });
    expect(result.success).toBe(false);
  });

  it("day_of_month capped at 28", () => {
    const result = createScheduleSchema.safeParse({
      frequency: "monthly",
      day_of_month: 31,
      recipient_emails: ["a@b.com"],
    });
    expect(result.success).toBe(false);
  });
});

describe("isScheduleDue — time-window logic", () => {
  it("returns true when weekly schedule matches day and time", () => {
    const schedule = {
      frequency: "weekly" as const,
      dayOfWeek: 1,
      dayOfMonth: null,
      timeOfDay: "09:00",
      isActive: true,
    };
    // Monday 2026-07-06 09:15 UTC
    const now = new Date("2026-07-06T09:15:00Z");
    expect(now.getUTCDay()).toBe(1);
    expect(isScheduleDue(schedule, now)).toBe(true);
  });

  it("returns false when inactive", () => {
    const schedule = {
      frequency: "weekly" as const,
      dayOfWeek: 1,
      dayOfMonth: null,
      timeOfDay: "09:00",
      isActive: false,
    };
    const now = new Date("2026-07-06T09:15:00Z");
    expect(isScheduleDue(schedule, now)).toBe(false);
  });

  it("returns false when wrong day of week", () => {
    const schedule = {
      frequency: "weekly" as const,
      dayOfWeek: 3,
      dayOfMonth: null,
      timeOfDay: "09:00",
      isActive: true,
    };
    const now = new Date("2026-07-06T09:15:00Z"); // Monday
    expect(isScheduleDue(schedule, now)).toBe(false);
  });

  it("returns true for monthly on correct day", () => {
    const schedule = {
      frequency: "monthly" as const,
      dayOfWeek: null,
      dayOfMonth: 15,
      timeOfDay: "14:00",
      isActive: true,
    };
    const now = new Date("2026-07-15T14:10:00Z");
    expect(isScheduleDue(schedule, now)).toBe(true);
  });

  it("returns false when outside 30-minute window", () => {
    const schedule = {
      frequency: "weekly" as const,
      dayOfWeek: 1,
      dayOfMonth: null,
      timeOfDay: "09:00",
      isActive: true,
    };
    const now = new Date("2026-07-06T09:45:00Z"); // 45 min past
    expect(isScheduleDue(schedule, now)).toBe(false);
  });

  it("returns false when time is before scheduled time", () => {
    const schedule = {
      frequency: "weekly" as const,
      dayOfWeek: 1,
      dayOfMonth: null,
      timeOfDay: "09:00",
      isActive: true,
    };
    const now = new Date("2026-07-06T08:50:00Z"); // 10 min before
    expect(isScheduleDue(schedule, now)).toBe(false);
  });

  it("time_of_day is treated as UTC", () => {
    const schedule = {
      frequency: "monthly" as const,
      dayOfWeek: null,
      dayOfMonth: 1,
      timeOfDay: "23:00",
      isActive: true,
    };
    const now = new Date("2026-07-01T23:05:00Z");
    expect(isScheduleDue(schedule, now)).toBe(true);
  });
});
