import { Lead, CalendarSlot } from '../types';

// Real product: no preloaded demo contacts. Users import their own leads via Excel/CSV.
export const INITIAL_LEADS: Lead[] = [];

/**
 * Generates open booking slots for the next N upcoming weekdays so the
 * calendar never ships with stale or fake pre-booked demo dates.
 */
function generateUpcomingSlots(
  weekdaysAhead: number = 6,
  times: string[] = ['10:00 AM', '02:00 PM']
): CalendarSlot[] {
  const slots: CalendarSlot[] = [];
  const cursor = new Date();
  let added = 0;
  let dayOffset = 1;

  while (added < weekdaysAhead) {
    const d = new Date(cursor);
    d.setDate(d.getDate() + dayOffset);
    dayOffset++;

    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue; // skip weekends

    const dateStr = d.toISOString().slice(0, 10);
    times.forEach((time, idx) => {
      slots.push({
        id: `slot-${dateStr}-${idx}`,
        date: dateStr,
        time,
        dateTimeIso: d.toISOString(),
        available: true,
      });
    });
    added++;
  }

  return slots;
}

export const INITIAL_CALENDAR_SLOTS: CalendarSlot[] = generateUpcomingSlots();
