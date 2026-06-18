# Opzava Branding Gate

Full brand name: `Opzava`.

The app is a heavily customized product, not a re-skinned upstream demo. Product-facing surfaces must not contain `Mission Control`, OpenClaw-first language, or upstream brand remnants after customization.

## Brand Rules

- Use `Opzava` as the full product brand in UI, metadata, onboarding, documentation intended for users, generated emails, generated article drafts, browser titles, app shell labels, screenshots, release notes, and marketing copy.
- Use `opzava` only for package names, repository slugs, URLs, database identifiers, CSS identifiers, and machine-readable names where lowercase is conventional.
- Do not use `Mission Control` as the app name, product name, dashboard title, package display name, generated content source name, or user-facing feature label.
- Do not preserve upstream logos, screenshots, favicon assets, app icons, alt text, or docs that show the upstream brand unless they are retained only as historical discovery evidence.
- Do not keep OpenClaw-first labels in product-facing flows unless a documented module still intentionally integrates with OpenClaw as a provider or imported legacy compatibility layer.

## Allowed Historical References

`Mission Control` is allowed only in these contexts:

- ARDs explaining the base-project decision.
- Discovery notes that cite upstream facts.
- Code comments that explain removal or migration from inherited upstream behavior.
- Tests that explicitly assert upstream-removal behavior.
- Git history, vendored upstream license notices, or attribution required by license.

When the reference is historical, write `Mission Control base` or `upstream Mission Control`, not the product name.

## Product-Facing Surfaces To Rebrand

- App metadata and browser titles.
- Root layout labels.
- Navigation labels.
- Dashboard headers.
- Settings and integrations panels.
- Login, setup, onboarding, and empty states.
- API docs exposed in the app.
- Public assets, favicon, icons, logo files, and alt text.
- Generated article drafts, approval messages, WordPress draft metadata, and future email drafts.
- Package display metadata where it appears in the app or release artifacts.
- README and deployment docs intended for Opzava operators.

## Brand Removal Checklist

Before the branded fork is considered done:

- Search source, docs, tests, messages, public assets, screenshots, and metadata for `Mission Control`.
- Classify every match as allowed historical reference or required removal.
- Replace product-facing matches with `Opzava`.
- Replace inherited image assets or alt text that expose upstream branding.
- Update app icons and screenshots to Opzava-branded assets.
- Add tests or snapshot checks for app title, navigation, onboarding, settings, and generated-content metadata.
- Record any retained historical references in discovery notes.

## Gate

No product-facing surface can ship with upstream brand remnants.

Any new `Mission Control` string introduced after the fork must be rejected unless it appears in an allowed historical reference.
