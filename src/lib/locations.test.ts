import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseHours, withStudierendenwerkLocations } from './locations.ts'
import type { Canteen } from './types.ts'

test('parseHours expands day ranges', () => {
  assert.deepEqual(parseHours('mon-thu 09:00-15:00, fri 10:00-14:00'), {
    mon: { start: '09:00', end: '15:00' },
    tue: { start: '09:00', end: '15:00' },
    wed: { start: '09:00', end: '15:00' },
    thu: { start: '09:00', end: '15:00' },
    fri: { start: '10:00', end: '14:00' },
  })
  assert.deepEqual(parseHours('sat 10:00-12:00'), { sat: { start: '10:00', end: '12:00' } })
  assert.throws(() => parseHours('Mo-Do 9-15'))
})

const eatApiAdalbertstr: Canteen = {
  enum_name: 'STUCAFE_ADALBERTSTR',
  name: 'StuCafé Adalbertstraße',
  canteen_id: 'stucafe-adalbertstr',
  location: { address: 'Adalbertstraße 5, München', latitude: 48.151374, longitude: 11.580448 },
  queue_status: null,
  open_hours: { mon: { start: '11:00', end: '14:00' } },
}

test('corrects eat-api entries and adds missing locations', () => {
  const canteens = withStudierendenwerkLocations([eatApiAdalbertstr])
  const adalbert = canteens.find((c) => c.canteen_id === 'stucafe-adalbertstr')!
  assert.equal(adalbert.name, 'StuBistro Adalbertstraße')
  assert.equal(adalbert.swm_id, 452)
  assert.equal(adalbert.note?.en, 'LMU main building')
  assert.equal(adalbert.eat_api, true)
  assert.equal(adalbert.location.latitude, 48.151374) // eat-api coordinates kept
  assert.deepEqual(adalbert.open_hours.fri, { start: '09:00', end: '14:00' })

  const oettingen = canteens.find((c) => c.canteen_id === 'stubistro-oettingenstr')!
  assert.equal(oettingen.swm_id, 424)
  assert.equal(oettingen.eat_api, false)
  assert.equal(oettingen.location.address, 'Oettingenstr. 67, 80538 München')

  // Corrections for eat-api entries that are absent are not invented.
  assert.equal(canteens.some((c) => c.canteen_id === 'mensa-garching'), false)
})
