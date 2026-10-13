import type { StyleSpecification } from 'maplibre-gl'

// OpenFreeMap's "dark" style is nearly black (background rgb(12,12,12), roads barely
// lighter). This lifts its colours into the slate range of the app's dark UI while
// keeping their relative contrast, and gives water and green areas a hint of colour.

type Rgb = [number, number, number] // 0–255
type Hsl = [number, number, number] // degrees, 0–1, 0–1

const NUMBER = String.raw`[-+]?(?:\d*\.)?\d+%?`
const COLOR_FUNCTION = new RegExp(String.raw`^(rgba?|hsla?)\(\s*(${NUMBER})[\s,]+(${NUMBER})[\s,]+(${NUMBER})(?:[\s,/]+(${NUMBER}))?\s*\)$`, 'i')

function channel(value: string, max: number): number {
  return value.endsWith('%') ? (parseFloat(value) / 100) * max : parseFloat(value)
}

function parseColor(value: string): { rgb: Rgb; alpha: number } | null {
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim())
  if (hex) {
    let digits = hex[1]
    if (digits.length <= 4) digits = [...digits].map((d) => d + d).join('')
    const n = (i: number) => parseInt(digits.slice(i, i + 2), 16)
    return { rgb: [n(0), n(2), n(4)], alpha: digits.length === 8 ? n(6) / 255 : 1 }
  }
  const fn = COLOR_FUNCTION.exec(value.trim())
  if (!fn) return null
  const alpha = fn[5] === undefined ? 1 : channel(fn[5], 1)
  if (fn[1].toLowerCase().startsWith('rgb')) {
    return { rgb: [channel(fn[2], 255), channel(fn[3], 255), channel(fn[4], 255)], alpha }
  }
  return { rgb: hslToRgb([parseFloat(fn[2]), channel(fn[3], 1), channel(fn[4], 1)]), alpha }
}

function rgbToHsl([r, g, b]: Rgb): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4
  return [h * 60, s, l]
}

function hslToRgb([h, s, l]: Hsl): Rgb {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}

type Recolor = (hsl: Hsl) => Hsl

/** Lifts near-black greys into the app's slate range; coloured accents keep their hue. */
const base: Recolor = ([h, s, l]) => {
  const lifted = Math.min(0.9, 0.17 + l * 1.05)
  return s < 0.15 ? [220, 0.1, lifted] : [h, s, lifted]
}
const water: Recolor = ([, , l]) => [212, 0.3, 0.13 + l * 0.4]
const greenery: Recolor = (hsl) => {
  const [, , l] = base(hsl)
  return [150, 0.1, l]
}

function recolorFor(layerId: string, layerType: string): Recolor {
  if (layerType === 'fill' || layerType === 'line') {
    if (/water/.test(layerId)) return water
    if (/park|wood|grass|landcover/.test(layerId)) return greenery
  }
  return base
}

function recolorValue(value: unknown, recolor: Recolor): unknown {
  if (Array.isArray(value)) return value.map((v) => recolorValue(v, recolor))
  if (typeof value !== 'string') return value
  const color = parseColor(value)
  if (!color) return value
  const [r, g, b] = hslToRgb(recolor(rgbToHsl(color.rgb)))
  return `rgba(${r}, ${g}, ${b}, ${+color.alpha.toFixed(3)})`
}

/** For `map.setStyle(url, { transformStyle })`. */
export function softenDarkStyle(_previous: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification {
  const layers = next.layers.map((layer) => {
    if (!('paint' in layer) || !layer.paint) return layer
    const recolor = recolorFor(layer.id, layer.type)
    const paint = Object.fromEntries(
      Object.entries(layer.paint).map(([key, value]) => [key, key.endsWith('color') ? recolorValue(value, recolor) : value]),
    )
    return { ...layer, paint }
  })
  return { ...next, layers: layers as StyleSpecification['layers'] }
}
