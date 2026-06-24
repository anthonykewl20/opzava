import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMissionControl } from './index'

/**
 * FE-1: interfaceMode must persist to localStorage (mc-interface-mode) and be
 * restored on boot, mirroring headerDensity. Before the fix the initializer
 * always returned 'essential' and setInterfaceMode did a bare set() with no
 * persistence, so switching to 'full' was lost on every reload.
 */
describe('interfaceMode persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    // Reset to the boot-time default so each case starts from a clean slate.
    useMissionControl.setState({ interfaceMode: 'essential' })
  })

  afterEach(() => {
    localStorage.clear()
    useMissionControl.setState({ interfaceMode: 'essential' })
    vi.resetModules()
  })

  it('setInterfaceMode writes the mode to localStorage (mc-interface-mode)', () => {
    useMissionControl.getState().setInterfaceMode('full')
    expect(localStorage.getItem('mc-interface-mode')).toBe('full')
    expect(useMissionControl.getState().interfaceMode).toBe('full')
  })

  it('setInterfaceMode back to essential also persists', () => {
    useMissionControl.getState().setInterfaceMode('full')
    useMissionControl.getState().setInterfaceMode('essential')
    expect(localStorage.getItem('mc-interface-mode')).toBe('essential')
    expect(useMissionControl.getState().interfaceMode).toBe('essential')
  })

  it('a fresh store instance restores the persisted mode from localStorage on boot', async () => {
    // Seed storage as if a prior session had selected 'full'.
    localStorage.setItem('mc-interface-mode', 'full')
    // Re-import the module fresh so the initializer re-runs against seeded
    // storage, exercising the boot-time read path.
    vi.resetModules()
    const fresh = await import('./index')
    expect(fresh.useMissionControl.getState().interfaceMode).toBe('full')
  })

  it('defaults to essential when no persisted value is present', async () => {
    // No mc-interface-mode in storage (cleared in beforeEach). A fresh import
    // must fall back to 'essential'.
    vi.resetModules()
    const fresh = await import('./index')
    expect(fresh.useMissionControl.getState().interfaceMode).toBe('essential')
  })
})
