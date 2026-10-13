import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { LngLat, Map as MapLibreMap } from 'maplibre-gl'

interface PinchEvent {
  phase: 'begin' | 'update' | 'end'
  x: number
  y: number
  scale: number
}

// Safari/WKWebView's non-standard pinch event.
interface GestureEvent extends UIEvent {
  scale: number
  clientX: number
  clientY: number
}

const ua = navigator.userAgent
const isWebKitGtk = /Linux/.test(ua) && /AppleWebKit/.test(ua) && !/Chrome|Chromium|Android/.test(ua)

/**
 * WebKitGTK reports the legacy `wheelDelta` as 120 per scroll tick for every device, but
 * converts ticks to pixels at 40 px for touchpads and at viewHeight^(2/3) px for mouse
 * wheels (≥ 68 px at this app's minimum window height). So |wheelDelta / delta| is 3 for
 * touchpads and at most ~1.8 for wheels.
 */
function isTouchpadScroll(event: WheelEvent): boolean {
  if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return false
  const legacy = event as WheelEvent & { wheelDeltaX?: number; wheelDeltaY?: number }
  const vertical = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
  const delta = Math.abs(vertical ? event.deltaY : event.deltaX)
  const legacyDelta = Math.abs((vertical ? legacy.wheelDeltaY : legacy.wheelDeltaX) ?? 0)
  return delta > 0 && legacyDelta / delta > 2.2
}

/**
 * Touchpad gestures over the map: pinching zooms the map around the fingers (instead of
 * magnifying the whole UI), and on Linux two-finger scrolling pans it. Mouse wheels keep
 * zooming. Returns a cleanup function.
 */
export function attachTouchpadGestures(map: MapLibreMap): () => void {
  const container = map.getContainer()
  const cleanups: (() => void)[] = []
  let pinch: { zoom: number; around: LngLat } | null = null

  const pinchBegin = (clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY)
    if (!target || !container.contains(target)) {
      pinch = null // started over the sidebar or a control: ignore the whole gesture
      return
    }
    const rect = container.getBoundingClientRect()
    pinch = { zoom: map.getZoom(), around: map.unproject([clientX - rect.left, clientY - rect.top]) }
  }
  const pinchUpdate = (scale: number) => {
    if (pinch) map.zoomTo(pinch.zoom + Math.log2(scale), { around: pinch.around, duration: 0 })
  }
  const pinchEnd = () => (pinch = null)

  // Linux: pinches are taken from WebKitGTK and forwarded by src-tauri/src/gestures.rs.
  if (isTauri()) {
    const unlisten = listen<PinchEvent>('touchpad-pinch', ({ payload }) => {
      if (payload.phase === 'begin') pinchBegin(payload.x, payload.y)
      else if (payload.phase === 'update') pinchUpdate(payload.scale)
      else pinchEnd()
    })
    cleanups.push(() => void unlisten.then((stop) => stop()))
  }

  // macOS: WKWebView delivers pinches as Safari gesture events.
  const gestureListeners: [string, (event: Event) => void][] = [
    ['gesturestart', (e) => pinchBegin((e as GestureEvent).clientX, (e as GestureEvent).clientY)],
    ['gesturechange', (e) => pinchUpdate((e as GestureEvent).scale)],
    ['gestureend', pinchEnd],
  ]
  for (const [type, handler] of gestureListeners) {
    const listener = (event: Event) => {
      event.preventDefault()
      handler(event)
    }
    container.addEventListener(type, listener)
    cleanups.push(() => container.removeEventListener(type, listener))
  }

  // WebKitGTK: two-finger scrolling pans. Runs in the capture phase, before MapLibre's
  // own wheel handler, which still zooms for mouse wheels and Ctrl+scroll.
  if (isWebKitGtk) {
    let touchpadUntil = 0
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return
      const now = performance.now()
      // Once a gesture is recognised, keep treating it as one, even its tiniest deltas.
      if (now > touchpadUntil && !isTouchpadScroll(event)) return
      touchpadUntil = now + 250
      event.preventDefault()
      event.stopPropagation()
      map.panBy([event.deltaX, event.deltaY], { duration: 0 })
    }
    container.addEventListener('wheel', onWheel, { capture: true, passive: false })
    cleanups.push(() => container.removeEventListener('wheel', onWheel, { capture: true }))
  }

  return () => cleanups.forEach((cleanup) => cleanup())
}
