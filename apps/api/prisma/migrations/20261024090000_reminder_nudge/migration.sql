-- Manual "Nudge now" reminders share the ReminderLog table (and its one-per-day uniqueness).
ALTER TYPE "ReminderKind" ADD VALUE 'NUDGE';
