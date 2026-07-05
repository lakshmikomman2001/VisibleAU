"use client";

import { useState, useCallback, type FormEvent } from "react";

type Frequency = "weekly" | "monthly";

interface ScheduleFormData {
  frequency: Frequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeUtc: string;
  recipientEmails: string[];
  active: boolean;
}

interface ScheduleFormProps {
  onSubmit: (data: ScheduleFormData) => void;
  loading?: boolean;
}

const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 14,
  borderRadius: 8,
  border: "1px solid var(--border-default)",
  backgroundColor: "var(--bg-base)",
  color: "var(--text-primary)",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--text-secondary)",
  marginBottom: 6,
};

export function ScheduleForm({ onSubmit, loading }: ScheduleFormProps) {
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [dayOfWeek, setDayOfWeek] = useState<number>(1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [timeUtc, setTimeUtc] = useState("09:00");
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const addEmail = useCallback(() => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    if (emails.includes(trimmed)) return;
    setEmails((prev) => [...prev, trimmed]);
    setEmailInput("");
  }, [emailInput, emails]);

  const removeEmail = useCallback((email: string) => {
    setEmails((prev) => prev.filter((e) => e !== email));
  }, []);

  const handleEmailKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addEmail();
      }
    },
    [addEmail],
  );

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};

    if (frequency === "weekly" && dayOfWeek == null) {
      next.dayOfWeek = "day_of_week required for weekly";
    }
    if (frequency === "monthly" && dayOfMonth == null) {
      next.dayOfMonth = "day_of_month required for monthly";
    }
    if (
      frequency === "monthly" &&
      dayOfMonth != null &&
      (dayOfMonth < 1 || dayOfMonth > 28)
    ) {
      next.dayOfMonth = "Day of month must be between 1 and 28";
    }
    if (!timeUtc) {
      next.timeUtc = "Time is required";
    }
    if (emails.length === 0) {
      next.emails = "At least one recipient email is required";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [frequency, dayOfWeek, dayOfMonth, timeUtc, emails]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      onSubmit({
        frequency,
        dayOfWeek: frequency === "weekly" ? dayOfWeek : null,
        dayOfMonth: frequency === "monthly" ? dayOfMonth : null,
        timeUtc,
        recipientEmails: emails,
        active,
      });
    },
    [frequency, dayOfWeek, dayOfMonth, timeUtc, emails, active, validate, onSubmit],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5"
      style={{ maxWidth: 480 }}
    >
      {/* Frequency */}
      <div>
        <label htmlFor="schedule-frequency" style={labelStyle}>
          Frequency
        </label>
        <select
          id="schedule-frequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
          style={{ ...inputStyle, cursor: "pointer" }}
          onFocus={(e) => {
            e.currentTarget.style.boxShadow = `0 0 0 2px var(--focus-ring)`;
          }}
          onBlur={(e) => {
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      {/* Conditional: day of week or day of month */}
      {frequency === "weekly" ? (
        <div>
          <label htmlFor="schedule-day-of-week" style={labelStyle}>
            Day of Week
          </label>
          <select
            id="schedule-day-of-week"
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
            style={{ ...inputStyle, cursor: "pointer" }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = `0 0 0 2px var(--focus-ring)`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {DAYS_OF_WEEK.map((day, i) => (
              <option key={day} value={i}>
                {day}
              </option>
            ))}
          </select>
          {errors.dayOfWeek && (
            <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
              {errors.dayOfWeek}
            </p>
          )}
        </div>
      ) : (
        <div>
          <label htmlFor="schedule-day-of-month" style={labelStyle}>
            Day of Month (1-28)
          </label>
          <input
            id="schedule-day-of-month"
            type="number"
            min={1}
            max={28}
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Number(e.target.value))}
            style={{
              ...inputStyle,
              fontVariantNumeric: "tabular-nums",
            }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = `0 0 0 2px var(--focus-ring)`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          {errors.dayOfMonth && (
            <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
              {errors.dayOfMonth}
            </p>
          )}
        </div>
      )}

      {/* Time (UTC) */}
      <div>
        <label htmlFor="schedule-time" style={labelStyle}>
          Time of Day
        </label>
        <input
          id="schedule-time"
          type="time"
          value={timeUtc}
          onChange={(e) => setTimeUtc(e.target.value)}
          style={{
            ...inputStyle,
            fontVariantNumeric: "tabular-nums",
          }}
          onFocus={(e) => {
            e.currentTarget.style.boxShadow = `0 0 0 2px var(--focus-ring)`;
          }}
          onBlur={(e) => {
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
          Displayed as local time. Stored as UTC.
        </p>
        {errors.timeUtc && (
          <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
            {errors.timeUtc}
          </p>
        )}
      </div>

      {/* Recipient Emails */}
      <div>
        <label htmlFor="schedule-email-input" style={labelStyle}>
          Recipient Emails
        </label>

        {/* Email chips */}
        {emails.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {emails.map((email) => (
              <span
                key={email}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{
                  backgroundColor: "var(--layer-comm-soft)",
                  color: "var(--text-primary)",
                }}
              >
                {email}
                <button
                  type="button"
                  onClick={() => removeEmail(email)}
                  aria-label={`Remove ${email}`}
                  className="rounded-full ml-0.5"
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--text-tertiary)",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            id="schedule-email-input"
            type="email"
            placeholder="name@example.com"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onKeyDown={handleEmailKeyDown}
            style={inputStyle}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = `0 0 0 2px var(--focus-ring)`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          <button
            type="button"
            onClick={addEmail}
            className="flex-shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{
              border: "1px solid var(--border-default)",
              backgroundColor: "var(--bg-base)",
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            Add
          </button>
        </div>
        {errors.emails && (
          <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
            {errors.emails}
          </p>
        )}
      </div>

      {/* Active toggle */}
      <div className="flex items-center justify-between">
        <label
          htmlFor="schedule-active-toggle"
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)", cursor: "pointer" }}
        >
          Active
        </label>
        <button
          id="schedule-active-toggle"
          type="button"
          role="switch"
          aria-checked={active}
          onClick={() => setActive((v) => !v)}
          className="relative flex-shrink-0 rounded-full transition-colors"
          style={{
            width: 36,
            height: 20,
            border: "none",
            cursor: "pointer",
            backgroundColor: active
              ? "var(--layer-comm)"
              : `color-mix(in srgb, var(--text-tertiary) 30%, transparent)`,
            padding: 0,
          }}
        >
          <span
            className="block rounded-full transition-transform"
            style={{
              width: 16,
              height: 16,
              backgroundColor: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              transform: active
                ? "translateX(18px)"
                : "translateX(2px)",
              marginTop: 2,
            }}
          />
        </button>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
        style={{
          border: "none",
          backgroundColor: loading ? "var(--bg-subtle)" : "var(--layer-comm)",
          color: loading ? "var(--text-tertiary)" : "#fff",
          cursor: loading ? "not-allowed" : "pointer",
        }}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = `0 0 0 2px var(--focus-ring)`;
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        {loading ? "Saving…" : "Save Schedule"}
      </button>
    </form>
  );
}
