# Screenshot Guide

This document explains how to capture and update the README screenshots so they stay in sync with the UI.

## Screenshots in the README

| File | Section | Description |
|------|---------|-------------|
| `docs/mission-control-overview.png` | Dashboard Overview | Main dashboard view |
| `docs/mission-control-agents.png` | Agents Panel | Active agents list |
| `docs/mission-control-memory-graph.png` | Memory Graph | Agent memory graph |

## When to Refresh

Screenshots should be updated when:

- A new page, panel, or major UI component is added
- An existing page layout changes noticeably
- The color scheme or branding updates
- A PR touches UI source under `src/app/`, `src/components/`, or `public/`

## How to Take New Screenshots

### Prerequisites

- Opzava running locally (`pnpm dev` or Docker)
- Browser with at least 1440×900 viewport recommended

### Steps

1. **Start the app** (with some sample data for a realistic view):

   ```bash
   pnpm dev
   # or
   docker compose up
   ```

2. **Seed sample data** (optional but recommended for non-empty screenshots):

   ```bash
   pnpm seed   # if a seed script exists, otherwise populate via UI
   ```

3. **Navigate to each page** and take a screenshot:

   | Screenshot | URL | Notes |
   |-----------|-----|-------|
   | `mission-control-overview.png` | `/` | Main dashboard, full page |
   | `mission-control-agents.png` | `/agents` | Agents panel open |
   | `mission-control-memory-graph.png` | `/memory` | Memory graph with nodes |

4. **Crop and optimise** to reduce file size:

   ```bash
   # macOS
   pngcrush -reduce -brute input.png output.png

   # Linux
   optipng -o5 input.png
   # or
   pngquant --quality=80-95 --output output.png input.png
   ```

5. **Replace the files** under `docs/` and commit:

   ```bash
   cp ~/Downloads/dashboard.png docs/mission-control-overview.png
   git add docs/
   git commit -m "docs: refresh README screenshots"
   ```

## When to refresh

There is no automated drift check (the dedicated workflow was retired to keep CI
to the highest-priority gate only). Treat any PR that changes files under
`src/app/`, `src/components/`, or `public/` as a prompt to review whether the
README screenshots need a refresh — capture is always a manual, human decision.

## Tips

- Use a consistent browser zoom level (100%) and window size
- Hide bookmarks bar and dev tools before capturing
- Light mode and dark mode screenshots can coexist — add a `*-dark.png` variant if useful
- Prefer PNG for UI screenshots (lossless); JPEG for photos/illustrations
