import { host } from '@hermes/plugin-sdk'

const ID = 'profile-watermark'
const STYLE_ID = 'hermes-profile-watermark-styles'

const CSS = `
.hermes-profile-watermark-container {
  position: absolute;
  right: 2.5rem;
  bottom: calc(var(--composer-measured-height, 60px) + 1.25rem);
  pointer-events: none;
  user-select: none;
  z-index: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-end;
  line-height: 0.82;
  transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.hermes-profile-watermark-text {
  font-family: 'Inter', var(--dt-font-sans, var(--font-sans, system-ui)), -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
  font-weight: 900;
  font-size: clamp(4.5rem, 10vw, 8.5rem);
  letter-spacing: -0.06em;
  text-transform: uppercase;
  opacity: 0.09;
  transition: color 0.35s ease, opacity 0.35s ease;
  white-space: nowrap;
}
`

function getProfileDisplayName(name) {
  const clean = (name ?? '').trim().toLowerCase()
  if (!clean || clean === 'default') {
    try {
      const custom = localStorage.getItem('hermes.profileWatermark.defaultName')
      if (custom) return custom.trim().toUpperCase()
    } catch {}
    return 'HERMES'
  }
  return clean.toUpperCase()
}

function getProfileColor(name) {
  const clean = (name ?? '').trim().toLowerCase()

  // 1. User-configured override in localStorage
  try {
    const raw = localStorage.getItem('hermes.desktop.profileColors')
    if (raw) {
      const overrides = JSON.parse(raw)
      if (overrides && clean && overrides[clean]) {
        return overrides[clean]
      }
    }
  } catch {}

  // 2. Default profile falls back to the active theme accent
  if (!clean || clean === 'default') {
    return 'var(--ui-accent)'
  }

  // 3. Fallback to Hermes Desktop deterministic hue algorithm
  let hash = 0
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0
  }
  const hue = hash % 360
  return `hsl(${hue} 68% 58%)`
}

function resolveActiveProfile() {
  return (
    host.state.focusedSessionProfile?.get?.() ||
    host.state.profile?.get?.() ||
    'default'
  )
}

function syncWatermarks() {
  const activeProfile = resolveActiveProfile()
  const displayName = getProfileDisplayName(activeProfile)
  const color = getProfileColor(activeProfile)

  const boundsList = document.querySelectorAll('[data-slot="composer-bounds"]')

  if (boundsList.length > 0) {
    boundsList.forEach(bounds => {
      let wm = bounds.querySelector('.hermes-profile-watermark-container')
      if (!wm) {
        wm = document.createElement('div')
        wm.className = 'hermes-profile-watermark-container'

        const text = document.createElement('span')
        text.className = 'hermes-profile-watermark-text'
        wm.appendChild(text)

        bounds.appendChild(wm)
      }

      const textEl = wm.querySelector('.hermes-profile-watermark-text')
      if (textEl) {
        if (textEl.textContent !== displayName) {
          textEl.textContent = displayName
        }
        textEl.style.color = color
      }
    })
  }
}

export default {
  id: ID,
  name: 'Profile Watermark',
  description: 'Displays a large, subtle watermark of the active bot profile in the chat background.',
  register(ctx) {
    // 1. Inject styling
    let style = document.getElementById(STYLE_ID)
    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.append(style)
    }

    ctx.onDispose(() => {
      style?.remove()
      document.querySelectorAll('.hermes-profile-watermark-container').forEach(el => el.remove())
    })

    // 2. Initial sync
    syncWatermarks()

    // 3. Reactive subscriptions to host state
    const unsubs = []
    if (host.state.focusedSessionProfile?.subscribe) {
      unsubs.push(host.state.focusedSessionProfile.subscribe(() => syncWatermarks()))
    }
    if (host.state.profile?.subscribe) {
      unsubs.push(host.state.profile.subscribe(() => syncWatermarks()))
    }
    if (host.state.activeSessionId?.subscribe) {
      unsubs.push(host.state.activeSessionId.subscribe(() => syncWatermarks()))
    }
    if (host.state.focusedSessionId?.subscribe) {
      unsubs.push(host.state.focusedSessionId.subscribe(() => syncWatermarks()))
    }

    ctx.onDispose(() => {
      unsubs.forEach(unsub => {
        try {
          unsub()
        } catch {}
      })
    })

    // 4. MutationObserver to handle layout re-renders & tab changes
    let rafId = null
    const observer = new MutationObserver(() => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        syncWatermarks()
      })
    })

    observer.observe(document.body, { childList: true, subtree: true })

    ctx.onDispose(() => {
      if (rafId) cancelAnimationFrame(rafId)
      observer.disconnect()
    })

    // 5. Watch localStorage color changes from rail picker
    const onStorage = e => {
      if (e.key === 'hermes.desktop.profileColors' || e.key === 'hermes.profileWatermark.defaultName') {
        syncWatermarks()
      }
    }
    window.addEventListener('storage', onStorage)
    ctx.onDispose(() => {
      window.removeEventListener('storage', onStorage)
    })
  }
}
