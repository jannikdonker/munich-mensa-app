// Calendar and opening-hours helpers. All times are Munich local time, independent of
// the device's time zone. Dates are "YYYY-MM-DD" strings handled with UTC arithmetic.

import type { Canteen, DayKey, OpenRange } from './types'

const TIME_ZONE = 'Europe/Berlin'
const MS_PER_DAY = 86_400_000

export interface Now {
  date: string // today in Munich
  minutes: number // minutes since local midnight
}

const nowFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function munichNow(at = new Date()): Now {
  const part = Object.fromEntries(nowFormat.formatToParts(at).map((p) => [p.type, p.value]))
  return {
    date: `${part.year}-${part.month}-${part.day}`,
    minutes: Number(part.hour) * 60 + Number(part.minute),
  }
}

function toUtc(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function addDays(date: string, days: number): string {
  return new Date(toUtc(date).getTime() + days * MS_PER_DAY).toISOString().slice(0, 10)
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(date: string): number {
  return (toUtc(date).getUTCDay() + 6) % 7
}

export function dayKey(date: string): DayKey {
  return (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const)[weekdayIndex(date)]
}

export function mondayOf(date: string): string {
  return addDays(date, -weekdayIndex(date))
}

export function isoWeek(date: string): { year: number; week: number } {
  const thursday = toUtc(addDays(mondayOf(date), 3))
  const year = thursday.getUTCFullYear()
  const week = 1 + Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * MS_PER_DAY))
  return { year, week }
}

/** Today on weekdays; next Monday on weekends, when canteens are closed. */
export function defaultDate(today: string): string {
  const index = weekdayIndex(today)
  return index >= 5 ? addDays(today, 7 - index) : today
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export type OpenState =
  | { kind: 'open'; until: string } // today, open right now
  | { kind: 'later'; from: string } // today, opens later
  | { kind: 'done' } // today, already closed
  | { kind: 'day'; range: OpenRange } // another day, open
  | { kind: 'closed' } // closed all day

export function hoursOn(canteen: Canteen, date: string): OpenRange | undefined {
  return canteen.open_hours[dayKey(date)]
}

export function openState(canteen: Canteen, date: string, now: Now): OpenState {
  const range = hoursOn(canteen, date)
  if (!range) return { kind: 'closed' }
  if (date !== now.date) return { kind: 'day', range }
  if (now.minutes < toMinutes(range.start)) return { kind: 'later', from: range.start }
  if (now.minutes < toMinutes(range.end)) return { kind: 'open', until: range.end }
  return { kind: 'done' }
}

/** Open now, opening later today, or open at all on another day. */
export function isOpenOn(state: OpenState): boolean {
  return state.kind === 'open' || state.kind === 'later' || state.kind === 'day'
}
