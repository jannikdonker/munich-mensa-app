<script lang="ts">
  import { app } from './store.svelte'
  import { t } from './i18n'
  import type { OpenState } from './time'

  let { state }: { state: OpenState } = $props()

  const label = $derived.by(() => {
    switch (state.kind) {
      case 'open':
        return t(app.lang, 'openUntil', { time: state.until })
      case 'later':
        return t(app.lang, 'opensAt', { time: state.from })
      case 'done':
        return t(app.lang, 'closedForToday')
      case 'day':
        return `${state.range.start} – ${state.range.end}`
      case 'closed':
        return t(app.lang, 'closed')
    }
  })
</script>

<span class="pill pill--{state.kind}">{label}</span>

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.15em 0.6em;
    border-radius: 999px;
    white-space: nowrap;
    background: var(--surface-2);
    color: var(--text-2);
  }
  .pill::before {
    content: '';
    width: 0.5em;
    height: 0.5em;
    border-radius: 50%;
    background: currentColor;
  }
  .pill--open {
    background: var(--open-bg);
    color: var(--open);
  }
  .pill--later {
    background: var(--later-bg);
    color: var(--later);
  }
  .pill--day {
    color: var(--text-1);
  }
  .pill--day::before {
    display: none;
  }
</style>
