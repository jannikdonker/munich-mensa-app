import type { Canteen, DayKey, OpenRange } from './types'

/**
 * Studierendenwerk München Oberbayern locations as listed on
 * https://www.studierendenwerk-muenchen-oberbayern.de/gastronomie/standorte-und-oeffnungszeiten/
 * (lecture-period hours, checked 2026-10-13).
 *
 * Entries whose `id` exists in eat-api correct it: several places were renamed and their
 * menu pages renumbered, and some hours changed. The others are missing from eat-api.
 * `swmId` is the number in the location's menu page, speiseplan_<swmId>_-de.html.
 */
interface Location {
  id: string
  swmId?: number
  name?: string
  note?: { de: string; en: string }
  address?: string
  coordinates?: [latitude: number, longitude: number]
  /** e.g. "mon-thu 09:00-15:00, fri 10:00-14:00" */
  hours?: string
}

const LOCATIONS: Location[] = [
  // Corrections of eat-api entries
  { id: 'mensa-arcisstr', swmId: 421, hours: 'mon-thu 11:00-14:30, fri 11:00-14:00' },
  { id: 'mensa-garching', swmId: 422 },
  { id: 'mensa-leopoldstr', swmId: 411 },
  { id: 'mensa-lothstr', swmId: 431, hours: 'mon-thu 11:00-14:30, fri 11:00-14:00' },
  {
    id: 'mensa-martinsried',
    swmId: 412,
    address: 'Großhaderner Str. 6, 82152 Planegg-Martinsried',
    coordinates: [48.1098988, 11.4599723],
  },
  { id: 'mensa-pasing', swmId: 432 },
  { id: 'mensa-weihenstephan', swmId: 423 },
  { id: 'stubistro-arcisstr', swmId: 450, hours: 'mon-fri 08:30-15:00' },
  { id: 'stubistro-goethestr', swmId: 418, hours: 'mon-thu 09:00-14:30, fri 10:00-14:00' },
  {
    id: 'stubistro-butenandstr',
    swmId: 414,
    name: 'StuBistro Butenandtstraße',
    hours: 'mon-thu 08:30-15:00, fri 08:30-14:00',
  },
  { id: 'stubistro-schellingstr', swmId: 416, hours: 'mon-thu 09:00-15:00, fri 10:00-14:00' },
  { id: 'stubistro-martinsried', swmId: 415 },
  {
    id: 'stucafe-adalbertstr',
    swmId: 452,
    name: 'StuBistro Adalbertstraße',
    note: { de: 'LMU-Hauptgebäude', en: 'LMU main building' },
    address: 'Adalbertstr. 5, 80799 München',
    hours: 'mon-thu 09:00-15:00, fri 09:00-14:00',
  },
  { id: 'stucafe-karlstr', swmId: 453, name: 'StuBistro Karlstraße', hours: 'mon-fri 08:15-15:00' },
  {
    id: 'stucafe-connollystr',
    swmId: 425,
    name: 'StuBistro Olympiacampus',
    address: 'Am Olympiacampus 11, 80809 München',
    coordinates: [48.1815471, 11.5436278],
    hours: 'mon-thu 11:00-14:30, fri 11:00-14:00',
  },
  { id: 'stucafe-garching', swmId: 426, hours: 'mon-thu 09:00-16:00, fri 08:30-15:00' },
  { id: 'stucafe-boltzmannstr', swmId: 457, hours: 'mon-fri 08:30-15:00' },
  {
    id: 'stucafe-weihenstephan-maximus',
    swmId: 454,
    name: 'StuBistro Weihenstephan-Maximus',
    hours: 'mon-thu 08:30-15:00, fri 08:30-14:30',
  },
  {
    id: 'stucafe-akademie-weihenstephan',
    swmId: 456,
    name: 'StuBistro Weihenstephan-Akademie',
    hours: 'mon-thu 08:00-14:30, fri 08:00-14:00',
  },
  { id: 'stucafe-pasing', hours: 'mon-thu 09:00-14:45, fri 09:00-14:15' },

  // Missing from eat-api
  {
    id: 'stubistro-oettingenstr',
    swmId: 424,
    name: 'StuBistro Oettingenstraße',
    note: { de: 'LMU Informatik', en: 'LMU computer science' },
    address: 'Oettingenstr. 67, 80538 München',
    coordinates: [48.1497391, 11.5943641],
    hours: 'mon-thu 09:00-15:00, fri 10:00-14:00',
  },
  {
    id: 'stubistro-akademiestr',
    swmId: 455,
    name: 'StuBistro Akademiestraße',
    note: { de: 'Umbau: verkürzte Öffnungszeiten', en: 'Renovation: reduced hours' },
    address: 'Akademiestr. 2-4, 80799 München',
    coordinates: [48.1530561, 11.5802424],
    hours: 'mon-thu 11:00-14:00',
  },
  {
    id: 'stubistro-bernd-eichinger-platz',
    swmId: 451,
    name: 'StuBistro Bernd-Eichinger-Platz',
    note: { de: 'HFF / Kunstareal', en: 'HFF film school' },
    address: 'Bernd-Eichinger-Platz 1, 80333 München',
    coordinates: [48.1466444, 11.5695103],
    hours: 'mon-thu 08:30-16:00, fri 08:30-15:00',
  },
  {
    id: 'stubistro-oberschleissheim',
    swmId: 419,
    name: 'StuBistro Oberschleißheim',
    address: 'Sonnenstr. 16a, 85764 Oberschleißheim',
    coordinates: [48.2480257, 11.5486196],
    hours: 'mon-fri 08:30-13:30',
  },
  {
    id: 'stucafe-leopoldstr',
    swmId: 511,
    name: 'StuCafé Leopoldstraße',
    note: { de: 'rein vegan/vegetarisch', en: 'vegan/vegetarian only' },
    address: 'Leopoldstr. 13a, 80802 München',
    coordinates: [48.156311, 11.582446],
    hours: 'mon-thu 09:00-15:00, fri 09:00-14:00',
  },
  {
    id: 'stucafe-arcisstr',
    swmId: 522,
    name: 'StuCafé Arcisstraße',
    note: { de: 'TUM-Bibliothek', en: 'TUM library' },
    address: 'Arcisstr. 21, 80333 München',
    coordinates: [48.1488833, 11.5677668],
    hours: 'mon-thu 08:00-16:00, fri 08:00-15:00',
  },
  {
    id: 'stucafe-lothstr',
    swmId: 533,
    name: 'StuCafé Lothstraße',
    note: { de: 'Hochschule München', en: 'Munich University of Applied Sciences' },
    address: 'Lothstr. 64, 80335 München',
    coordinates: [48.1542829, 11.5567009],
    hours: 'mon-thu 09:00-15:00, fri 09:00-14:00',
  },
  {
    id: 'mensa-ottobrunn',
    swmId: 433,
    name: 'Mensa Ottobrunn-Taufkirchen',
    note: { de: 'TUM-Campus Ottobrunn', en: 'TUM Ottobrunn campus' },
    address: 'Willy-Messerschmitt-Str. 5, 82024 Taufkirchen',
    coordinates: [48.0487941, 11.6565959],
    hours: 'mon-fri 11:00-15:00',
  },
]

const DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const HOURS_PART = /^(mon|tue|wed|thu|fri|sat|sun)(?:-(mon|tue|wed|thu|fri|sat|sun))? (\d\d:\d\d)-(\d\d:\d\d)$/

export function parseHours(spec: string): Partial<Record<DayKey, OpenRange>> {
  const hours: Partial<Record<DayKey, OpenRange>> = {}
  for (const part of spec.split(',').map((p) => p.trim())) {
    const match = HOURS_PART.exec(part)
    if (!match) throw new Error(`invalid opening hours: ${part}`)
    const [, from, to = from, start, end] = match
    const first = DAYS.indexOf(from as DayKey)
    const last = DAYS.indexOf(to as DayKey)
    for (const day of DAYS.slice(first, last + 1)) hours[day] = { start, end }
  }
  return hours
}

/** eat-api's canteen list with the corrections and additions above applied. */
export function withStudierendenwerkLocations(fromEatApi: Canteen[]): Canteen[] {
  const canteens = new Map(fromEatApi.map((c) => [c.canteen_id, { ...c, eat_api: true }]))
  for (const location of LOCATIONS) {
    const base = canteens.get(location.id)
    const { name, address, coordinates, hours } = location
    if (!base && !(name && address && coordinates && hours)) continue
    canteens.set(location.id, {
      enum_name: base?.enum_name ?? location.id,
      canteen_id: location.id,
      queue_status: base?.queue_status ?? null,
      name: name ?? base!.name,
      location: {
        address: address ?? base!.location.address,
        latitude: coordinates?.[0] ?? base!.location.latitude,
        longitude: coordinates?.[1] ?? base!.location.longitude,
      },
      open_hours: hours ? parseHours(hours) : base!.open_hours,
      swm_id: location.swmId,
      note: location.note,
      eat_api: !!base,
    })
  }
  return [...canteens.values()]
}
