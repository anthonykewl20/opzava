'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * ThemeSwitch — the header's segmented light/dark control, faithful to
 * docs/architecture/ux-redesign/mockups/theme-toggle.js. Two icon segments
 * (☀ light · ☾ dark) on a pill track with a raised active segment.
 *
 * The opzava-ds shell carries its theme on the `.opzava-ds` root via the
 * `data-ds-theme` attribute (default = dark; `light` opts in — see
 * src/app/opzava-ds.css). This control flips that attribute on the nearest
 * `.opzava-ds` ancestor and remembers the choice in localStorage, so the admin
 * Full view can switch dark↔light without touching the legacy next-themes layer.
 */
const STORAGE_KEY = 'opzava-ds-theme'
type DsTheme = 'dark' | 'light'

export function ThemeSwitch() {
  const ref = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<DsTheme>('dark')

  const apply = (next: DsTheme) => {
    const root = ref.current?.closest('.opzava-ds') as HTMLElement | null
    if (root) {
      if (next === 'dark') root.removeAttribute('data-ds-theme')
      else root.setAttribute('data-ds-theme', next)
    }
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* storage unavailable */ }
    setTheme(next)
  }

  // Hydrate from the remembered choice after mount (server renders the dark default).
  useEffect(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem(STORAGE_KEY) } catch { /* storage unavailable */ }
    apply(saved === 'light' ? 'light' : 'dark')
  }, [])

  return (
    <div ref={ref} id="theme-switch" className="theme-switch" role="group" aria-label="Theme">
      <button
        type="button"
        className="theme-seg"
        data-seg="light"
        aria-label="Light mode"
        title="Light mode"
        aria-pressed={theme === 'light'}
        onClick={() => apply('light')}
      >
        ☀
      </button>
      <button
        type="button"
        className="theme-seg"
        data-seg="dark"
        aria-label="Dark mode"
        title="Dark mode"
        aria-pressed={theme === 'dark'}
        onClick={() => apply('dark')}
      >
        ☾
      </button>
    </div>
  )
}
