<script lang="ts">
  import { iconPaths, type IconName } from './icons'

  let { name, size = 18, filled = false }: { name: IconName; size?: number; filled?: boolean } = $props()
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={filled ? 'currentColor' : 'none'}
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={iconPaths[name]} />
</svg>
