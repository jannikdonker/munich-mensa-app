// Minimal 24×24 stroke icons, shared by <Icon> and the HTML of Leaflet markers.
export const iconPaths = {
  mensa: 'M6 3v5a2 2 0 0 0 4 0V3M8 3v18M17 21V3c-2 1.5-3 4.5-3 8h3',
  bistro: 'M3 11h18a9 9 0 0 1-18 0ZM8 21h8M9 3.5c-1 1 1 2 0 4M15 3.5c-1 1 1 2 0 4',
  cafe: 'M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5ZM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4',
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  route: 'M12 2 4 21l8-4 8 4Z',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  close: 'M6 6l12 12M18 6 6 18',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41',
  moon: 'M20.5 14.1A8.5 8.5 0 1 1 9.9 3.5a6.6 6.6 0 0 0 10.6 10.6Z',
}

export type IconName = keyof typeof iconPaths

export function iconSvg(name: IconName, size = 18): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPaths[name]}"/></svg>`
}
