# 02 — Design System Spec

> Governs `mockups/tokens.css` and `mockups/app.css`. Every token, scale, and component listed here is normative — implementation deviates only with a documented reason.

---

## Design Principles

| # | Principle | Rationale |
|---|-----------|-----------|
| 1 | **Signal over noise** | Each element must serve a decision. If it cannot be traced to a user action or status read, remove it. Decorative gradients, glow effects, and purely aesthetic animations are disallowed. |
| 2 | **Minimalism** | Fewer, larger, better-spaced elements reduce cognitive load (Miller's Law: ≤9 items per visual chunk). White space is a first-class layout tool — not a gap to fill. |
| 3 | **One accent discipline** | A single primary accent color (`--primary`) carries all interactive intent. Status uses semantic tokens (`--success`, `--warning`, `--destructive`, `--info`) only. No decorative color. 90%+ of surface area uses neutral tones. |
| 4 | **Restraint on glass / glow / neon** | The existing `.void-border-glow`, `.glow-*`, `.btn-neon`, and `.void-bg` utilities have ≤4 real usages across 44 panels and carry permanent GPU animations. They are retired. `.shimmer`, `.pulse-live`, and `.pulse-dot` are the only surviving effect utilities. |
| 5 | **8pt grid** | All spacing, icon sizes, touch targets, and layout dimensions are multiples of 8px (with 4px as the half-step for tight internal padding). Layouts do not invent off-grid values. |
| 6 | **Tesler's Law governs complexity** | The system absorbs irreducible complexity — shared components, tokens, and layer architecture — so that individual panels stay thin and decision-free. |

---

## Typography Scale

> Body floor: **15px (0.9375rem)**. Only `text-micro` (formerly `text-2xs`) at 11px is permitted, strictly for decorative-only supplementary labels.
> `tabular-nums` is required on every element rendering numeric or timestamp data.

### Token definitions

| Token | rem | px | line-height | weight | Usage |
|-------|-----|----|-------------|--------|-------|
| `--text-display` | 2rem | 32px | 1.2 | 700 | Page-level KPI callout numbers only |
| `--text-h1` | 1.5rem | 24px | 1.25 | 700 | Panel primary heading |
| `--text-h2` | 1.25rem | 20px | 1.3 | 600 | Section heading within a panel |
| `--text-h3` | 1.0625rem | 17px | 1.35 | 600 | Card/group heading |
| `--text-body` | 0.9375rem | **15px** | 1.6 | 400 | Default prose, table cells, form labels |
| `--text-sm` | 0.875rem | 14px | 1.5 | 400 | Secondary labels, button labels, nav items |
| `--text-xs` | 0.75rem | 12px | 1.4 | 400 | Supplementary metadata: timestamps, IDs, badge content. **Floor for readable content.** |
| `--text-micro` | 0.6875rem | 11px | 1.3 | 500 | **Decorative only.** Version strings, dot indicators with sr-only label. Never primary information. |

### Retired tokens

| Token | Former px | Retirement reason |
|-------|-----------|-------------------|
| `text-2xs` (tailwind.config.js `0.625rem`) | 10px | Below antialiasing threshold on standard-DPI displays; institutionalizes illegibility. Rename to `text-micro` (11px) and document as decorative-only. Finding: 295 usages, 44 carrying readable primary content. |
| Arbitrary `text-[8px]`, `text-[9px]`, `text-[10px]`, `text-[11px]` | 8–11px | Bypass token system, invisible to audits. Replace with nearest scale token. 426 total occurrences documented in parity findings. |

### Numeric / data cells

- Apply `font-variant-numeric: tabular-nums` (or Tailwind `tabular-nums`) to every element displaying counts, costs, timestamps, durations, and IDs in aligned columns.
- The existing `.font-mono-tight` utility in `globals.css` already sets this; apply it (or the utility class) at the column / cell level in every data panel.
- Align numeric columns **right**; text columns **left**. Qualitative IDs (run IDs, UUIDs) are left-aligned exceptions.
- Evidence of gap: `tabular-nums` appears in only 8 of 85 files rendering numeric data (cost-tracker, cron-management, task-board all missing it).

### Body floor enforcement

Add to `globals.css` `@layer base`:

```css
body {
  font-size: var(--text-body); /* 0.9375rem = 15px */
  line-height: 1.6;
}
```

Remove `maximumScale: 1` from `src/app/layout.tsx` Viewport export (WCAG 1.4.4 violation). Change root `overflow-hidden` to a per-panel `overflow-y-auto` scroll container pattern.

---

## Spacing Scale

Base unit: **4px**. All values are multiples. The 8px step is the standard increment; 4px is reserved for tight internal element spacing only.

| Token | px | Usage |
|-------|----|-------|
| `--space-1` | 4px | Icon-to-label gap, badge padding |
| `--space-2` | 8px | Compact internal element padding (`p-2`) |
| `--space-3` | 12px | Tight card padding, compact row height padding |
| `--space-4` | 16px | **Default card body padding** (`p-4`); standard gap between sibling elements |
| `--space-5` | 20px | — (avoid; use `--space-4` or `--space-6`) |
| `--space-6` | 24px | Section gap, generous card padding |
| `--space-8` | 32px | Panel inset, page-level section separation |
| `--space-10` | 40px | Large section breaks |
| `--space-12` | 48px | Page hero / KPI block top-padding |

Semantic aliases (declare in `:root`):

```css
--card-padding: var(--space-4);          /* 16px — canonical card body */
--card-padding-compact: var(--space-3);  /* 12px — density-compact mode */
--panel-inset: var(--space-8);           /* 32px — panel outer padding */
--component-gap: var(--space-4);         /* 16px — gap between sibling cards */
--row-gap: var(--space-2);               /* 8px — table/list row internal padding */
```

Remove the ad-hoc tailwind spacing extensions (`18`, `88`, `112`, `128`) unless explicitly required — these bypass the semantic scale.

---

## Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Inputs, selects, badges, small buttons |
| `--radius-md` | 6px | Cards, panels, dropdowns |
| `--radius-lg` | 8px | Modals, sheets, large containers |
| `--radius-full` | 9999px | Pills, status dots, avatars |

Map to Tailwind config:

```js
borderRadius: {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  full: 'var(--radius-full)',
}
```

---

## Elevation / Shadow Tokens

Shadows scale with theme luminosity. Define in `:root` and override per theme.

| Token | Value (dark default) | Usage |
|-------|----------------------|-------|
| `--shadow-sm` | `0 1px 2px hsl(var(--background) / 0.5)` | Badge, chip, inline element lift |
| `--shadow-md` | `0 4px 12px hsl(var(--background) / 0.6)` | Card, dropdown |
| `--shadow-lg` | `0 8px 24px hsl(var(--background) / 0.7)` | Modal, sheet, floating panel |
| `--shadow-none` | `none` | Flush / borderless elements |

**Do not** use `box-shadow` with fixed hex/rgb values in component classes — they do not adapt across themes.

Retire the ad-hoc shadow values currently inlined in `.void-panel` and `.void-border-glow`.

---

## Motion Tokens

### Duration and easing

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-fast` | 120ms | Micro-interactions: hover states, badge color changes |
| `--duration-base` | 200ms | Standard transitions: panel fade-in, button press, tooltip |
| `--duration-slow` | 320ms | Sheet/modal enter, page transitions, skeleton reveal |
| `--ease-out` | `cubic-bezier(0.0, 0.0, 0.2, 1)` | Elements entering the screen |
| `--ease-in-out` | `cubic-bezier(0.4, 0.0, 0.2, 1)` | Elements moving across the screen |
| `--ease-in` | `cubic-bezier(0.4, 0.0, 1, 1)` | Elements exiting the screen |

Map to Tailwind config:

```js
transitionDuration: {
  fast: 'var(--duration-fast)',   // 120ms
  base: 'var(--duration-base)',   // 200ms
  slow: 'var(--duration-slow)',   // 320ms
},
transitionTimingFunction: {
  'ease-out': 'var(--ease-out)',
  'ease-in-out': 'var(--ease-in-out)',
  'ease-in': 'var(--ease-in)',
},
```

Replace 18 hardcoded `duration-200`/`duration-300`/`duration-150` occurrences in `src/components/` with these tokens.

### Keyframe consolidation

All `@keyframes` blocks belong in `tailwind.config.js` only. Remove the duplicate `@keyframes fadeIn`, `@keyframes slideInRight`, `@keyframes slideInLeft`, `@keyframes pulse-dot`, `@keyframes pulse-live` from `globals.css` (lines 307–370). Replace corresponding `.slide-in-right`, `.slide-in-left`, `.fade-in` utilities with `animate-slide-in-right`, `animate-fade-in` Tailwind classes.

### Reduced-motion rule (WCAG 2.3.3 — P0 fix)

The existing `@layer base` reset is defeated by Tailwind utilities (which live in `@layer utilities`). Fix: place the reduced-motion override **outside all `@layer` blocks** so it has unlayered specificity and wins unconditionally:

```css
/* After all @layer blocks — unlayered specificity wins */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Additionally extend this block to cover previously-omitted boot loader animations: `.animate-converge-top`, `.animate-converge-bottom`, `.animate-glow-pulse`, `.animate-float` — set `animation: none !important; opacity: 1 !important` on each.

At every `animate-pulse`/`animate-spin` call site, add `motion-reduce:animate-none` (50 + 28 occurrences respectively). grep returns zero `motion-reduce:` usages currently.

---

## Color & Theming

### Existing HSL token names — KEEP

The following tokens are established across 44 panels and all themes. Do not rename them.

```
--background        --foreground        --card              --card-foreground
--primary           --primary-foreground --secondary        --secondary-foreground
--muted             --muted-foreground  --border            --input
--ring              --accent            --accent-foreground
--success           --warning           --destructive       --info
--surface-0         --surface-1         --surface-2         --surface-3
```

### New token additions

```css
--muted-foreground-subtle   /* explicitly set compliant value for /60-range use cases */
--card-padding              /* see Spacing above */
--font-size-min: 0.9375rem  /* 15px floor — all text tokens clamp to this */
```

### Theme pruning — 10 → 3 defaults

Maintaining 10 themes against a 44-panel surface with 361 hardcoded color overrides and 6 themes currently failing WCAG AA on `--muted-foreground` is an unsustainable maintenance surface.

**Recommended canonical themes:**

| Theme | Class | Profile |
|-------|-------|---------|
| **Void** (dark, default) | `.void` | Near-black `215 27% 4%` background; single cyan primary. Current default — keep. |
| **Paper** (light) | `.paper` | Warm white `40 40% 95%` background; accessible neutral primary. Fix `--muted-foreground` from `30 10% 45%` (4.22:1 fail) to `30 12% 38%` (≥4.5:1). |
| **High Contrast** (dark) | `.high-contrast` | New. Black background `0 0% 0%`; white foreground; primary blue at 60% lightness. For regulated/enterprise contexts. |

Remaining 7 themes (midnight-blue, synthwave, solarized-dark, catppuccin, dracula, nord, retro-terminal, vercel) move to an opt-in "extended themes" bundle. They must pass a CI contrast test (see below) before shipping.

### Void accent discipline

`--primary` (cyan, `192 95% 55%`) is the single interactive accent. Neon variants (`.glow-cyan`, `.glow-mint`, `.glow-violet`, `.btn-neon`) are retired. The `.void-panel` class (4 usages) is replaced by the canonical `Card` component with a `variant="surface"` prop.

### muted-foreground minimum fix (6 themes failing — P0/P1)

Raise `--muted-foreground` lightness in each failing theme so the full token achieves ≥5.0:1 against `--background` (buffer for /70 opacity use → ≥4.5:1 after reduction):

| Theme | Current lightness | Fixed lightness | Current ratio | Target ratio |
|-------|------------------|-----------------|---------------|--------------|
| void | 50% | 58% | 4.54:1 | ≥5.5:1 |
| synthwave | 50% | 60% | 4.32:1 | ≥5.0:1 |
| nord | 52% | 62% | 3.73:1 | ≥5.0:1 |
| dracula | 55% | 63% | 4.27:1 | ≥5.0:1 |
| solarized-dark | 45% | 58% | 4.31:1 | ≥5.0:1 |
| retro-terminal | 35% | 55% | 3.66:1 | ≥5.5:1 |
| paper | 45% | 38% (lower = darker on light) | 4.22:1 | ≥5.0:1 |
| catppuccin | 55% | 64% | 4.28:1 | ≥5.0:1 |

**Eliminate `/50` and `/40` and `/30` opacity modifiers on text entirely.** Replace with `--muted-foreground-subtle` set to a value that passes 4.5:1 at zero opacity. (314 opacity-modifier instances documented in findings.)

### CI contrast gate

Add a vitest assertion in `test/` that computes relative luminance from HSL for `--muted-foreground` vs `--background` across all declared themes and asserts ≥4.7:1.

### Badge semantic token fix

Update badge utilities to use semantic tokens:

```css
.badge-success { @apply bg-success/15 text-success border border-success/20; }
.badge-warning { @apply bg-warning/15 text-warning border border-warning/20; }
.badge-error   { @apply bg-destructive/15 text-destructive border border-destructive/20; }
.badge-info    { @apply bg-info/15 text-info border border-info/20; }
```

Replace 361 hardcoded `text-green-400`, `text-amber-500`, `text-red-400`, `text-blue-400` panel occurrences with `text-success`, `text-warning`, `text-destructive`, `text-info`.

---

## CSS @layer Architecture

### Canonical layer declaration

Place this as the **first line** of `globals.css`:

```css
/* Cascade order: reset < base < components < utilities < themes */
/* Unlayered rules (prefers-reduced-motion override) appear after all @layer blocks */
@layer reset, base, components, utilities, themes;
```

### Layer responsibilities

| Layer | Contents | Wins over |
|-------|----------|-----------|
| `reset` | Tailwind preflight; `* { box-sizing: border-box; }` | nothing |
| `base` | `:root` CSS custom properties; element defaults (`body`, `a`, `button`); scrollbar styles | reset |
| `components` | `.card`, `.badge-*`, `.glass`, `.panel`, `.panel-header`, `.panel-body`, `.font-mono-tight`, `.digital-clock`, `.shimmer`, `.void-panel` | base |
| `utilities` | Single-purpose helpers: `.surface-0`–`.surface-3`, `.pulse-live`, `.pulse-dot`, `.fade-in`, `.slide-in-right`, `.transition-smooth` | components |
| `themes` | `.void`, `.paper`, `.high-contrast` (and extended themes) | utilities |

### Required migrations from current state

1. **Merge the two `@layer base` blocks** (currently at lines 5–94 and 96–133) into one contiguous declaration.
2. **Add `@layer components`** between base and utilities. Move `.glass`, `.glass-strong`, `.badge-*`, `.void-panel`, `.panel`, `.panel-header`, `.panel-body`, `.shimmer`, `.font-mono-tight`, `.digital-clock` from `@layer utilities` into `@layer components`.
3. **Move all theme classes** (`.void`, `.midnight-blue`, etc., currently outside any layer at lines 446–781) into `@layer themes`.
4. **Place the `prefers-reduced-motion` reset outside all `@layer` blocks** (see Motion Tokens above).

### Reference structure

```css
@layer reset, base, components, utilities, themes;

@layer reset {
  /* Tailwind preflight import or equivalent */
}

@layer base {
  :root { /* all CSS custom property tokens */ }
  body { font-size: var(--text-body); line-height: 1.6; }
  /* scrollbar, focus-visible defaults */
}

@layer components {
  .card { /* canonical card */ }
  .badge-success { @apply bg-success/15 text-success border border-success/20; }
  /* ... */
}

@layer utilities {
  .surface-0 { background: hsl(var(--surface-0)); }
  .pulse-live { /* status dot animation */ }
  /* single-property helpers only */
}

@layer themes {
  .void   { --background: 215 27% 4%; /* ... */ }
  .paper  { --background: 40 40% 95%; /* ... */ }
}

/* Unlayered — wins over everything */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Component Inventory

> Guiding law: **Tesler's Law** — the irreducible complexity of ARIA wiring, focus management, and token application belongs in the component, not in 44 independent panels.
> Composition over config: prefer `variant` + `size` props over deeply nested sub-components.
> **No icon library imports.** Use raw text/emoji or SVG inline; `data-state` + CSS for open/close indicators.

### Primitive components to standardize

| Component | File | Key anatomy / props | Notes |
|-----------|------|---------------------|-------|
| **Card** | `ui/card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardContent`; `size: 'default'\|'compact'`; `variant: 'default'\|'surface'\|'ghost'` | Replaces 72 hand-rolled `bg-card border border-border rounded-lg p-*` containers. Canonical padding: `p-4` (default), `p-3` (compact). Uses `--card-padding` token. |
| **Button** | `ui/button.tsx` (extend existing) | Add `size: 'xs'` → raise to `h-8` (32px min). Remove `h-auto` overrides in office-panel. | WCAG 2.5.8: 24×24px floor. Raise `xs` from current 28px (`h-7`) to 32px (`h-8`). Approval actions: `size='sm'` (36px) minimum. 182 `size='xs'\|'icon-xs'` usages affected. |
| **Input** | `ui/input.tsx` | `type`, `size: 'sm'\|'md'`; canonical focus: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`; `aria-invalid`, `aria-describedby` | Replaces 46 ad-hoc inline input class strings with 3 inconsistent focus styles. Never suppress focus ring. Font-size `var(--text-body)` (15px) minimum — prevents iOS viewport zoom. |
| **Textarea** | `ui/textarea.tsx` | Same token contract as Input; `rows` prop; `resize: vertical` only | No standalone implementation exists today. |
| **Select** | `ui/select.tsx` | Wraps Radix `Select.*` slots; same visual contract as Input; `placeholder`, `disabled`, `aria-label` | Radix provides keyboard navigation, ARIA, and portal rendering. |
| **Checkbox** | `ui/checkbox.tsx` | Wraps Radix `Checkbox`; `label` prop renders adjacent `<label>`; `indeterminate` state | Minimum touch target 24×24px; aim 44px with padding. |
| **Radio** | `ui/radio.tsx` | Wraps Radix `RadioGroup` + `RadioGroupItem`; `label` per item | |
| **Switch** | `ui/switch.tsx` | Wraps Radix `Switch`; `aria-label` required when no adjacent text label | |
| **Badge** | `ui/badge.tsx` | `variant: 'success'\|'warning'\|'error'\|'info'\|'neutral'\|'muted'`; `size: 'sm'\|'md'` | Replaces 258 hardcoded semantic color strings. Text at `text-xs` (12px) minimum with `font-medium`. Uses semantic tokens, not hardcoded Tailwind colors. |
| **StatusDot** | `ui/status-dot.tsx` | `status: 'ok'\|'warn'\|'error'\|'idle'\|'running'`; always renders `aria-label` + optional `sr-only` text sibling | Replaces 15+ color-only dots. Shape or `sr-only` text prevents WCAG 1.4.1 color-only failure. |
| **Tag** | `ui/tag.tsx` | Inline dismissible label; `onRemove` optional; `variant` maps to Badge variants | For taxonomy labels, filter chips. |
| **Table** | `ui/table.tsx` | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`; `numeric` prop on cells applies `tabular-nums text-right`; density class from context | Density presets: Condensed 40px row, Regular 48px, Relaxed 56px. Hairline row separators (`border-b border-border/10`). |
| **Tabs** | `ui/tabs.tsx` | Wraps Radix `Tabs.*`; `defaultValue`, `onValueChange`; panels are lazy-rendered | Replace ad-hoc tab patterns in agent-detail-tabs (2992 lines) and others. |
| **Toast** | `ui/toast.tsx` | Wraps Radix `Toast.*`; `variant: 'default'\|'success'\|'error'\|'warning'`; `duration: 4000`; `aria-live='polite'` for info, `'assertive'` for errors | Replaces ad-hoc error state divs in ~12 panels that have no retry action and no `aria-live`. |
| **Tooltip** | `ui/tooltip.tsx` | Wraps Radix `Tooltip.*`; `content`, `side`; 400ms open delay; `disableHoverableContent` off by default | For icon-only buttons and truncated text. |
| **Modal** | `ui/modal.tsx` | Wraps Radix `Dialog.*`; `Modal`, `ModalHeader`, `ModalBody`, `ModalFooter`; Escape handling, focus trap, return focus — all via Radix | Replaces 14 hand-rolled `fixed inset-0` overlays lacking `role='dialog'`, `aria-modal`, and Escape handling (WCAG 4.1.2 / 2.1.1). |
| **Sheet / Drawer** | `ui/sheet.tsx` | Wraps Radix `Dialog.*` with `data-side='right'\|'left'\|'bottom'`; slide-in at `--duration-slow`; `motion-reduce:translate-x-0` | For contextual detail panels and mobile nav. |
| **Skeleton** | `ui/skeleton.tsx` | `Skeleton` div with `.shimmer`; `width`, `height`, `rounded` props; `variant: 'text'\|'rect'\|'circle'` | Replaces full-panel `<Loader variant='panel' />` blanks in 20+ panels. Skeleton shapes mirror real content dimensions. Gate with `loading && data.length === 0`. |
| **EmptyState** | `ui/empty-state.tsx` | `icon` (text/emoji), `title`, `description`, `action` (Button); centered layout with `py-12` | Replaces ad-hoc "no data" divs. Standard empty state prevents user confusion (Jakob's Law). |
| **ErrorState / FetchError** | `ui/error-state.tsx` | `message`, `onRetry`; `role='alert'`; retry button min 44px height (Fitts's Law) | Replaces ad-hoc `{error && <div className='text-red-400'>}` in ~12 panels with no retry and no `aria-live`. |
| **Stat / KPI** | `ui/stat.tsx` | `label`, `value`, `delta`, `trend: 'up'\|'down'\|'flat'`; value at `--text-display` (32px); label at `--text-xs` | Primary metric 3× larger than supporting data (visual hierarchy law). Value uses `tabular-nums`. |
| **ProgressBar** | `ui/progress-bar.tsx` | `value` 0–100; `label`; `aria-valuenow`/`aria-valuemin`/`aria-valuemax`; `variant` maps to semantic tokens | |
| **Pagination** | `ui/pagination.tsx` | `page`, `totalPages`, `onPageChange`; previous/next buttons ≥44px targets; shows page N of M | |

### Composition-over-config notes

- Components expose a `className` pass-through for one-off layout overrides — not a parallel `style` prop.
- Dark-mode variants (`dark:`) belong in the token layer, not in component JSX. If a component file contains `dark:` more than once, fix the theme token.
- All interactive components export their Radix primitive slots as named exports for cases requiring `asChild` composition without extra DOM nodes.
- `@radix-ui/react-slot` is already in the project (`@radix-ui/react-slot` in `package.json`); full Radix primitives (Dialog, Select, Tabs, Toast, Tooltip, Switch, Checkbox, RadioGroup) should be added as direct dependencies. Cost: ~3–8KB gzip per primitive.

### Shared utilities to extract

| Utility | File | Replaces |
|---------|------|---------|
| `relativeTime(ts, fallback)` | `lib/format-time.ts` | 9 independent time-formatter functions across channels, nodes, activity-timeline, exec-approval, webhook, system-monitor, audit-trail, message-bubble, session-message panels |
| `useServerEvents` migration | existing `lib/use-server-events.ts` | `setInterval` polling in 8+ panels (channels, cost-tracker, super-admin, nodes, office, task-board, agent-squad, skills). Replace with SSE subscription + one-time mount fetch. |

---

*Section count: 8 sections, 22 component rows, 9 spacing tokens, 8 type-scale tokens, 3 canonical themes, 5 CSS layers.*
