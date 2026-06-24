---
source:
  - https://uxplanet.org/principles-of-typography-in-ui-design-bc28f1f9666d
  - https://uxplanet.org/use-of-color-ea8c10861674
publisher: UX Planet (Medium)
author: Bryson M. (typography) + Lara Stumpf (color)
published: typography 2024-05-07 | color 2023-11-17
accessed: 2026-06-24
---

# Typography & Color for UX

> **TL;DR** — Type is hierarchy made readable: a small modular scale, ~16px body, 1.4–1.6 leading, left-aligned, in `rem`. Color is a token system that must pass WCAG 2.2 AA contrast and never carry meaning alone — always pair with icon, text, or pattern.

## Typography for readability

- **Body text ≥ 16px (1rem)** — below this degrades legibility on the web; 12px is for non-critical metadata only.
- **Readable line length ~45–75 characters** — let content width serve the text, not the other way around.
- **Line-height ~1.4–1.6 for body**, tighter (~1.1–1.3) for headings; too low crowds, too high severs lines.
- **Limited type scale** — pick a modular ratio (1.2–1.25) and derive every size from it; stops "hand-picked px" sprawl.
- **Max ~2 typefaces** (often one family with multiple weights) — consistency over novelty; decorative/fonts only for display.
- **Real hierarchy via size + weight + color**, not "make everything bold" — H1→H6 should be visually ordered.
- **Left-align body** — justified text creates "rivers" of whitespace and uneven word spacing; center only for headings/short blocks.
- **Sufficient paragraph spacing** — vertical rhythm matters as much as line spacing.
- **Use `rem` units** (not fixed `px`) so user zoom and browser font-size settings scale the whole UI.
- **Letter-spacing (tracking):** slightly tighter for large display, slightly looser for small caps/uppercase; never all-caps long runs of body text.

## Color for UX & accessibility

- **WCAG 2.2 AA contrast ≥ 4.5:1 for body text / ≥ 3:1 for large text (≥18pt / 14pt bold) and UI components / graphical objects** (SC 1.4.3 + 1.4.11). AAA bumps body to 7:1.
- **NEVER convey meaning by color alone** (SC 1.4.1) — always pair color with an icon, text label, underline, or pattern. ~8% of men have some color-vision deficiency.
- **Semantic color, consistently mapped to design tokens:** `success` / `warning` / `danger` / `info` — never inline hex per component.
- **Don't rely on red/green distinctions alone** (most common color blindness is red-green deuteranopia/protanopia) — add a shape/check/cross.
- **Status badges need a secondary cue** — e.g. a dot + label + color, so a badge is readable in grayscale or to a color-blind user.
- **Dark mode is a token swap, not a rebuild** — same semantic tokens, different values; avoid pure black (`#000`) — it causes halation/eye strain, use near-black.
- **Test contrast on the real background**, not in isolation — a token that passes on white may fail on a tinted card surface.
- **Non-text contrast ≥ 3:1** for borders, focus rings, icons, and control boundaries (SC 1.4.11) — a 1px gray border on a gray input often fails.
- **Links in text need >1 cue:** underline by default; if using color alone it needs 3:1 vs the text color and ~5:1 vs background (Technique G183).

## Frontend-actionable rules (Tailwind 3 + tokens)

- **Centralize the type scale and color in one place** — Tailwind `theme.fontSize` / `theme.colors`, or CSS custom properties; components consume tokens, never raw values.
- **Express themeable color in `oklch()` or `hsl()`** so light/dark variants stay perceptually uniform and easy to shift.
- **Use CSS custom properties for light/dark swap** + `@media (prefers-color-scheme: dark)` or a `.dark` class strategy — a single source of truth.
- **Fluid type via `clamp()`** — e.g. `font-size: clamp(1rem, 0.9rem + 0.5vw, 1.25rem)` for a heading that scales between breakpoints.
- **Define text/`bg` token pairs that are pre-verified for contrast** (e.g. `text-content` on `bg-surface`) and lint them, rather than re-checking every component.
- **Verify the palette with a contrast tool at the token level before building** — WAVE, axe-core, or WebAIM Contrast Checker; bake an `axe` check into CI/storybook.
- **Focus rings are non-negotiable** — visible `:focus-visible` at ≥3:1 contrast, never `outline: none` without a replacement (SC 2.4.11).
- **Respect user preferences** — `prefers-reduced-motion`, `prefers-contrast: more`, and OS-level text sizing.

## Anti-patterns to avoid

- Gray-on-gray body text that "looks elegant" but fails 4.5:1.
- Status conveyed by a colored dot/border alone (red ring on an invalid input with no message or icon).
- Justified body text creating rivers and uneven spacing.
- 12px body copy "to fit more on screen."
- 4+ font families loaded, killing performance and cohesion.
- Fixed `px` font sizes that ignore browser/user zoom.
- Hand-picked hex values scattered across components instead of tokens.
- Pure black backgrounds; low-contrast disabled states used as a substitute for "avoid disabled."
- Removing focus outlines without an accessible replacement.

## Quick checklist

- [ ] Body text ≥ 16px / 1rem, in `rem` not `px`.
- [ ] Body line-height 1.4–1.6; headings 1.1–1.3.
- [ ] Line length capped ~45–75 chars; body left-aligned.
- [ ] Type scale derived from one modular ratio (≤ ~7 steps); ≤ 2 typefaces.
- [ ] Every text/bg token pair verified ≥ 4.5:1 (AA); large/UI ≥ 3:1.
- [ ] No meaning by color alone — every status/error/state has icon, text, or pattern.
- [ ] Semantic color tokens (success/warning/danger/info) reused everywhere; dark mode is a token swap.
- [ ] Visible `:focus-visible` ring at ≥ 3:1; contrast checked on real surfaces, not in isolation.

## Source(s)

- https://uxplanet.org/principles-of-typography-in-ui-design-bc28f1f9666d — Bryson M., "Principles of Typography in UI Design" (accessed 2026-06-24)
- https://uxplanet.org/use-of-color-ea8c10861674 — Lara Stumpf, "Use of Color" (WCAG 1.4.1) (accessed 2026-06-24)
- WCAG 2.2 success criteria 1.4.1, 1.4.3, 1.4.11, 2.4.11 — https://www.w3.org/TR/WCAG22/ (contrast thresholds verified against the spec)
