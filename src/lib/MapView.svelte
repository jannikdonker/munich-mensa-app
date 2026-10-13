<script lang="ts">
  import * as maplibregl from 'maplibre-gl'
  import type { Map as MapLibreMap, Marker, Popup } from 'maplibre-gl'
  import { onMount, untrack } from 'svelte'
  import { isCentral, markerOffsets } from './canteens'
  import { t } from './i18n'
  import Icon from './Icon.svelte'
  import { iconSvg } from './icons'
  import { attachTouchpadGestures } from './mapGestures'
  import { setupMapLibre, styleUrl } from './mapSetup'
  import { softenDarkStyle } from './mapTheme'
  import { app, type ListItem } from './store.svelte'
  import type { Canteen, Kind } from './types'
  import type { OpenState } from './time'

  let {
    items,
    bottomInset = 0,
    onselect,
  }: {
    items: ListItem[]
    /** Height in px covered by the bottom sheet on small screens. */
    bottomInset?: number
    onselect: (id: string) => void
  } = $props()

  /** Space in px kept free around pins when fitting or revealing them. */
  const EDGE = 40

  let container: HTMLDivElement
  let map = $state.raw<MapLibreMap>()
  let tooltip: Popup | undefined
  let fitted = false
  const markers = new Map<string, { marker: Marker; element: HTMLDivElement; signature: string }>()
  const offsets = $derived(markerOffsets(app.canteens, 36))

  onMount(() => {
    setupMapLibre()
    const instance = new maplibregl.Map({
      container,
      center: [11.56, 48.15],
      zoom: 11,
      minZoom: 7,
      maxZoom: 19,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
    })
    instance.touchZoomRotate.disableRotation()
    instance.keyboard.disableRotation()
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    tooltip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, anchor: 'bottom', className: 'pin-tooltip' })

    const detachGestures = attachTouchpadGestures(instance)
    map = instance
    return () => {
      detachGestures()
      instance.remove()
    }
  })

  // Basemap follows the app theme; markers are DOM elements and survive the swap.
  let appliedDark: boolean | undefined
  $effect(() => {
    const dark = app.dark
    if (!map || dark === appliedDark) return
    appliedDark = dark
    map.setStyle(styleUrl(dark), { transformStyle: dark ? softenDarkStyle : undefined })
  })

  // The bottom sheet covers part of the map on phones. Camera padding makes zooming and
  // fitting centre on the visible part; the jump keeps the content where it is on screen.
  $effect(() => {
    const inset = bottomInset
    if (!map) return
    const { clientWidth, clientHeight } = map.getContainer()
    const center = map.unproject([clientWidth / 2, (clientHeight - inset) / 2])
    map.jumpTo({ center, padding: { top: 0, right: 0, left: 0, bottom: inset } })
  })

  function fitTo(canteens: Canteen[], animate = true) {
    if (!map || canteens.length === 0) return
    const bounds = new maplibregl.LngLatBounds()
    for (const c of canteens) bounds.extend([c.location.longitude, c.location.latitude])
    map.fitBounds(bounds, { padding: EDGE, maxZoom: 15, animate })
  }

  // Start zoomed to the city; Garching and Freising are one "show all" tap away.
  $effect(() => {
    if (!map || fitted || app.canteens.length === 0) return
    fitted = true
    untrack(() => fitTo(app.canteens.filter(isCentral), false))
  })

  function pinHtml(kind: Kind, state: OpenState['kind'], selected: boolean, favorite: boolean): string {
    const classes = ['pin', `pin--${kind}`, `pin--${state}`, selected ? 'pin--selected' : '']
    const star = favorite ? `<span class="pin-star">${iconSvg('star', 9, true)}</span>` : ''
    return `<div class="${classes.join(' ')}">${iconSvg(kind, 18)}</div>${star}`
  }

  function showTooltip(canteen: Canteen) {
    if (!map || !tooltip) return
    tooltip
      .setLngLat([canteen.location.longitude, canteen.location.latitude])
      .setOffset([offsets.get(canteen.canteen_id) ?? 0, -20])
      .setText(canteen.name)
      .addTo(map)
  }

  // Keep one marker per visible canteen; only redraw pins whose look changed.
  $effect(() => {
    const instance = map
    if (!instance) return
    const visible = new Set<string>()
    for (const item of items) {
      const { canteen } = item
      const id = canteen.canteen_id
      visible.add(id)
      let entry = markers.get(id)
      if (!entry) {
        const element = document.createElement('div')
        element.className = 'pin-anchor'
        element.addEventListener('click', (event) => {
          event.stopPropagation()
          onselect(id)
        })
        element.addEventListener('mouseenter', () => showTooltip(canteen))
        element.addEventListener('mouseleave', () => tooltip?.remove())
        const marker = new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat([canteen.location.longitude, canteen.location.latitude])
          .addTo(instance)
        element.setAttribute('aria-label', canteen.name)
        entry = { marker, element, signature: '' }
        markers.set(id, entry)
      }
      entry.marker.setOffset([offsets.get(id) ?? 0, 0])
      const selected = id === app.selectedId
      const signature = `${item.kind}|${item.state.kind}|${selected}|${item.favorite}`
      if (entry.signature !== signature) {
        entry.element.innerHTML = pinHtml(item.kind, item.state.kind, selected, item.favorite)
        entry.element.style.zIndex = selected ? '2' : '1'
        entry.signature = signature
      }
    }
    for (const [id, { marker }] of markers) {
      if (!visible.has(id)) {
        marker.remove()
        markers.delete(id)
      }
    }
  })

  // Bring the selected canteen into view without fighting the user's zoom level.
  $effect(() => {
    const selected = app.selected
    const instance = map
    if (!instance || !selected) return
    const target: [number, number] = [selected.location.longitude, selected.location.latitude]
    untrack(() => {
      if (instance.getZoom() < 13) {
        instance.easeTo({ center: target, zoom: 15 })
        return
      }
      const point = instance.project(target)
      const { clientWidth, clientHeight } = instance.getContainer()
      const inView =
        point.x > EDGE &&
        point.x < clientWidth - EDGE &&
        point.y > EDGE &&
        point.y < clientHeight - EDGE - bottomInset
      if (!inView) instance.easeTo({ center: target })
    })
  })
</script>

<div class="map-wrap">
  <div class="map" bind:this={container}></div>
  <button
    class="fit-all"
    title={t(app.lang, 'showAll')}
    aria-label={t(app.lang, 'showAll')}
    onclick={() => fitTo(items.map((i) => i.canteen))}
  >
    <Icon name="expand" size={16} />
  </button>
</div>

<style>
  .map-wrap {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .map {
    position: absolute;
    inset: 0;
    background: var(--map-bg);
  }
  /* Sits under MapLibre's zoom buttons and matches their look. */
  .fit-all {
    position: absolute;
    top: 78px;
    right: 10px;
    z-index: 2;
    width: 29px;
    height: 29px;
    display: grid;
    place-items: center;
    border-radius: 4px;
    background: var(--surface);
    color: var(--text-1);
    box-shadow: 0 0 0 2px rgb(0 0 0 / 0.1);
  }
  .fit-all:hover {
    background: var(--surface-2);
  }

  :global(.pin-anchor) {
    width: 34px;
    height: 34px;
    cursor: pointer;
  }
  :global(.pin) {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    border: 2px solid #fff;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.35);
    transition: transform 0.15s ease;
    position: relative;
  }
  :global(.pin--mensa) {
    background: var(--kind-mensa);
  }
  :global(.pin--bistro) {
    background: var(--kind-bistro);
  }
  :global(.pin--cafe) {
    background: var(--kind-cafe);
  }
  :global(.pin--done),
  :global(.pin--closed) {
    filter: grayscale(0.85);
    opacity: 0.75;
  }
  :global(.pin--open::after),
  :global(.pin--later::after) {
    content: '';
    position: absolute;
    top: -3px;
    right: -3px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid #fff;
    background: var(--open-solid);
  }
  :global(.pin--later::after) {
    background: var(--later-solid);
  }
  /* Favourite badge, opposite the open/closed dot. It sits beside the pin rather than in
     it, so that a closed pin's grey filter leaves it alone; it follows the pin's scaling. */
  :global(.pin-star) {
    position: absolute;
    top: -4px;
    left: -4px;
    width: 15px;
    height: 15px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    border: 2px solid #fff;
    background: var(--favorite);
    color: #fff;
    transition: transform 0.15s ease;
  }
  :global(.pin--selected + .pin-star) {
    transform: translate(-4px, -4px);
  }
  :global(.pin-anchor:hover .pin:not(.pin--selected) + .pin-star) {
    transform: translate(-2px, -2px);
  }
  :global(.pin--selected) {
    transform: scale(1.3);
    box-shadow:
      0 0 0 3px var(--accent),
      0 2px 8px rgb(0 0 0 / 0.4);
  }
  :global(.pin-anchor:hover .pin:not(.pin--selected)) {
    transform: scale(1.12);
  }

  /* Above the pins, which carry z-index 1–2 so the selected one stays on top. */
  :global(.pin-tooltip) {
    z-index: 3;
    pointer-events: none;
  }
  :global(.pin-tooltip .maplibregl-popup-content) {
    padding: 0.3rem 0.6rem;
    border-radius: 0.4rem;
    font-weight: 600;
    font-size: 0.8rem;
    background: var(--surface);
    color: var(--text-1);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
  }
  :global(.pin-tooltip .maplibregl-popup-tip) {
    border-top-color: var(--surface) !important;
  }
</style>
