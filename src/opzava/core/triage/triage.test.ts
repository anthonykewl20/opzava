import { describe, expect, it } from 'vitest'

import { needsDecomposition } from './triage'

describe('needsDecomposition', () => {
  it('flags a multi-step card for decomposition (heuristic)', () => {
    expect(needsDecomposition({ title: 'Launch', description: 'Research and draft, and then publish the series.' })).toBe(true)
  })

  it('does NOT decompose a simple card (conservative default)', () => {
    expect(needsDecomposition({ title: 'Fix the typo on the pricing page' })).toBe(false)
  })

  it('flags a big task by estimated hours', () => {
    expect(needsDecomposition({ title: 'Build the dashboard', estimatedHours: 12 })).toBe(true)
  })

  it('flags a very long description', () => {
    expect(needsDecomposition({ title: 'Spec', description: 'x'.repeat(1500) })).toBe(true)
  })

  it('the operator override wins over the heuristic — both ways', () => {
    // a heuristically-complex card forced OFF
    expect(needsDecomposition({ title: 'Build pipeline end-to-end', override: false })).toBe(false)
    // a heuristically-simple card forced ON
    expect(needsDecomposition({ title: 'tiny tweak', override: true })).toBe(true)
  })
})
