/** Distance in px a drag has to cover to move the sheet to its other position. */
const SNAP_DISTANCE = 80
/** Release speed in px/ms that counts as a flick, whatever the distance. */
const FLICK_SPEED = 0.3
/** Movement in px before a touch counts as a drag. Stays below iOS's scroll threshold. */
const SLOP = 4
/** Window in ms over which the release speed is measured. */
const SPEED_WINDOW = 100

interface SheetDragOptions {
  expanded: () => boolean
  /** The finger moved: the sheet should be this many px high. */
  ondrag: (height: number) => void
  /** The finger lifted: the sheet should snap to this position. */
  onrelease: (expanded: boolean) => void
}

/**
 * Whether a drag released after moving `moved` px down at `speed` px/ms (negative is up)
 * leaves the sheet expanded.
 */
export function releaseExpanded(wasExpanded: boolean, moved: number, speed: number): boolean {
  if (wasExpanded) {
    const down = speed > FLICK_SPEED || (speed > -FLICK_SPEED && moved > SNAP_DISTANCE)
    return !down
  }
  return speed < -FLICK_SPEED || (speed < FLICK_SPEED && moved < -SNAP_DISTANCE)
}

/** The innermost element between `target` and `sheet` whose content scrolls vertically. */
function scrollerOf(target: EventTarget | null, sheet: HTMLElement): HTMLElement | null {
  for (let el = target instanceof Element ? target : null; el && el !== sheet; el = el.parentElement) {
    if (
      el instanceof HTMLElement &&
      el.scrollHeight > el.clientHeight &&
      /auto|scroll/.test(getComputedStyle(el).overflowY)
    ) {
      return el
    }
  }
  return null
}

/**
 * Swiping the bottom sheet on phones: up expands it, down collapses it. On scrolling
 * content the swipe moves the sheet first (up while collapsed, down while expanded and
 * scrolled to the top) and scrolls the content otherwise. Returns a cleanup function.
 */
export function attachSheetDrag(sheet: HTMLElement, options: SheetDragOptions): () => void {
  let gesture: {
    x: number
    y: number
    scroller: HTMLElement | null
    expanded: boolean
    mode: 'pending' | 'drag' | 'native'
    height: number
    samples: { t: number; y: number }[]
  } | null = null

  const onStart = (event: TouchEvent) => {
    // A second finger ends the drag.
    if (event.touches.length !== 1) {
      if (gesture?.mode === 'drag') options.onrelease(gesture.expanded)
      gesture = null
      return
    }
    const touch = event.touches[0]
    gesture = {
      x: touch.clientX,
      y: touch.clientY,
      scroller: scrollerOf(event.target, sheet),
      expanded: options.expanded(),
      mode: 'pending',
      height: 0,
      samples: [],
    }
  }

  const onMove = (event: TouchEvent) => {
    if (!gesture || gesture.mode === 'native') return
    const touch = event.touches[0]
    if (gesture.mode === 'pending') {
      const dx = touch.clientX - gesture.x
      const dy = touch.clientY - gesture.y
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
      const { scroller, expanded } = gesture
      const movesSheet = !scroller || (expanded ? dy > 0 && scroller.scrollTop <= 0 : dy < 0)
      // Once the web view has started scrolling, the swipe can't be taken over any more.
      if (!event.cancelable || Math.abs(dx) > Math.abs(dy) || !movesSheet) {
        gesture.mode = 'native'
        return
      }
      gesture.mode = 'drag'
      gesture.y = touch.clientY
      gesture.height = sheet.offsetHeight
    }
    event.preventDefault()
    gesture.samples.push({ t: event.timeStamp, y: touch.clientY })
    options.ondrag(gesture.height - (touch.clientY - gesture.y))
  }

  const onEnd = (event: TouchEvent) => {
    if (gesture?.mode === 'drag') {
      const y = event.changedTouches[0].clientY
      const recent = gesture.samples.filter((s) => event.timeStamp - s.t <= SPEED_WINDOW)
      const first = recent[0]
      const speed = first && event.timeStamp > first.t ? (y - first.y) / (event.timeStamp - first.t) : 0
      options.onrelease(releaseExpanded(gesture.expanded, y - gesture.y, speed))
    }
    gesture = null
  }

  const onCancel = () => {
    if (gesture?.mode === 'drag') options.onrelease(gesture.expanded)
    gesture = null
  }

  sheet.addEventListener('touchstart', onStart, { passive: true })
  sheet.addEventListener('touchmove', onMove, { passive: false })
  sheet.addEventListener('touchend', onEnd)
  sheet.addEventListener('touchcancel', onCancel)
  return () => {
    sheet.removeEventListener('touchstart', onStart)
    sheet.removeEventListener('touchmove', onMove)
    sheet.removeEventListener('touchend', onEnd)
    sheet.removeEventListener('touchcancel', onCancel)
  }
}
