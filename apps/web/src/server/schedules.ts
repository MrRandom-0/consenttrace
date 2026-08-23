/**
 * Schedule cron subset: `M H * * *` (daily) and `M H * * D` (weekly, D=0-6 Sun).
 * Evaluated in server time for launch; per-timezone evaluation is tracked in
 * docs (schedules store the timezone field already).
 */
export interface ParsedCron {
  minute: number;
  hour: number;
  dayOfWeek: number | null;
}

export function parseCron(cron: string): ParsedCron | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [m, h, dom, mon, dow] = parts;
  if (dom !== '*' || mon !== '*') return null;
  const minute = Number(m);
  const hour = Number(h);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (dow === '*') return { minute, hour, dayOfWeek: null };
  const day = Number(dow);
  if (!Number.isInteger(day) || day < 0 || day > 6) return null;
  return { minute, hour, dayOfWeek: day };
}

/** Next occurrence strictly after `from`. */
export function nextRun(cron: string, from: Date = new Date()): Date | null {
  const parsed = parseCron(cron);
  if (!parsed) return null;
  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(parsed.minute);
  candidate.setHours(parsed.hour);
  for (let i = 0; i < 8; i++) {
    if (candidate > from && (parsed.dayOfWeek === null || candidate.getDay() === parsed.dayOfWeek)) {
      return candidate;
    }
    candidate.setDate(candidate.getDate() + 1);
  }
  return null;
}

export function describeCron(cron: string): string {
  const parsed = parseCron(cron);
  if (!parsed) return cron;
  const time = `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`;
  if (parsed.dayOfWeek === null) return `Daily at ${time}`;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `Every ${days[parsed.dayOfWeek]} at ${time}`;
}
