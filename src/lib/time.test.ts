import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Canteen } from './types.ts'
import { addDays, dayKey, defaultDate, isoWeek, mondayOf, munichNow, openState } from './time.ts'

test('isoWeek handles year boundaries', () => {
  const cases: [string, number, number][] = [
    ['2026-10-13', 2026, 42],
    ['2026-01-01', 2026, 1],
    ['2026-12-31', 2026, 53],
    ['2027-01-01', 2026, 53],
    ['2024-12-30', 2025, 1],
    ['2021-01-03', 2020, 53],
  ]
  for (const [date, year, week] of cases) assert.deepEqual(isoWeek(date), { year, week }, date)
})

test('calendar helpers', () => {
  assert.equal(mondayOf('2026-10-18'), '2026-10-12')
  assert.equal(dayKey('2026-10-13'), 'tue')
  assert.equal(addDays('2026-03-28', 2), '2026-03-30') // across the DST switch
  assert.equal(defaultDate('2026-10-16'), '2026-10-16') // Friday stays
  assert.equal(defaultDate('2026-10-17'), '2026-10-19') // Saturday → Monday
  assert.equal(defaultDate('2026-10-18'), '2026-10-19') // Sunday → Monday
})

test('munichNow uses Munich time regardless of device time zone', () => {
  assert.deepEqual(munichNow(new Date('2026-10-13T10:30:00Z')), { date: '2026-10-13', minutes: 12 * 60 + 30 })
  assert.deepEqual(munichNow(new Date('2026-12-31T23:30:00Z')), { date: '2027-01-01', minutes: 30 })
})

test('openState', () => {
  const canteen = { open_hours: { tue: { start: '11:00', end: '14:00' } } } as unknown as Canteen
  const now = { date: '2026-10-13', minutes: 12 * 60 }
  assert.deepEqual(openState(canteen, '2026-10-13', now), { kind: 'open', until: '14:00' })
  assert.deepEqual(openState(canteen, '2026-10-13', { ...now, minutes: 10 * 60 }), { kind: 'later', from: '11:00' })
  assert.deepEqual(openState(canteen, '2026-10-13', { ...now, minutes: 14 * 60 }), { kind: 'done' })
  assert.deepEqual(openState(canteen, '2026-10-14', now), { kind: 'closed' })
  assert.deepEqual(openState(canteen, '2026-10-20', now), { kind: 'day', range: { start: '11:00', end: '14:00' } })
})
