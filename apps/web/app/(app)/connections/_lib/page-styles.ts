export const connectionsPageStyles = `
    /* Page-specific layout only; shared primitives come from app tokens/classes. */
    .connections-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); }
    .connections-header-actions { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1); flex: none; }
    .connections-action-stack { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1); }
    .connections-refresh-status { color: var(--fg-subtle); font-size: var(--text-xs); }
    .connections-notice { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-2); align-items: start; padding: var(--space-3) var(--space-4); border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: var(--radius-md); background: var(--surface); }
    .connections-notice-warning { border-left-color: var(--warning); }
    .connections-notice-danger { border-left-color: var(--danger); }
    .connections-gateway-card .card-body, .connections-github-card .card-body { display: flex; flex-direction: column; gap: var(--space-4); }
    .connections-card-copy { color: var(--fg-muted); font-size: var(--text-sm); max-width: 72ch; }
    .connections-provider-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-3); }
    .connections-provider-count { color: var(--fg-muted); font-size: var(--text-sm); }
    .connections-provider-table-card { overflow: hidden; }
    .connections-provider-table td { vertical-align: top; }
    .connections-provider-table th:last-child, .connections-provider-table td:last-child { text-align: right; }
    .connections-provider-title { min-width: 0; flex-wrap: wrap; }
    .connections-provider-sub { margin-top: 2px; color: var(--fg-subtle); font-size: var(--text-xs); }
    .connections-provider-badges { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
    .connections-provider-status { display: inline-flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); }
    .connections-provider-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-2); }
    .connections-provider-toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-3); }
    .connections-provider-hint { font-size: var(--text-xs); }
    .connections-provider-search { width: min(280px, 100%); }
    .connections-provider-tiers { display: grid; gap: var(--space-5); }
    .connections-provider-tier { display: grid; gap: var(--space-2); }
    .connections-provider-tier-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
    .connections-provider-tier-head h3 { margin: 0; font-size: var(--text-base); line-height: var(--lh-snug); }
    .connections-provider-tier-summary { cursor: pointer; color: var(--fg); font-weight: var(--fw-medium); }
    .connections-provider-tier-title { margin-right: var(--space-2); }
    .connections-inline-alert { width: 100%; padding: var(--space-2) var(--space-3); border: 1px solid var(--warning-soft); border-radius: var(--radius-md); background: var(--warning-soft); color: var(--fg); font-size: var(--text-sm); text-align: left; }
    .connections-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
    .connections-key-form { position: relative; }
    .connections-key-form form { z-index: var(--z-dropdown); }
    .connections-empty { border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
    .connections-footer-note { color: var(--fg-muted); font-size: var(--text-sm); }
    .connections-github-card { border-left: 3px solid var(--accent); }
    @media (max-width: 980px) {
      .connections-provider-actions { align-items: flex-start; justify-content: flex-start; text-align: left; }
      .connections-provider-table th:last-child, .connections-provider-table td:last-child { text-align: left; }
    }
    @media (max-width: 640px) {
      .connections-page { padding: var(--space-4); }
      .connections-header, .connections-provider-toolbar { flex-direction: column; }
      .connections-header-actions, .connections-action-stack, .connections-provider-search { width: 100%; align-items: stretch; }
      .connections-provider-head { flex-direction: column; }
      .connections-actions .btn, .connections-provider-actions .btn, .connections-key-form { width: 100%; }
      .connections-actions form, .connections-provider-actions form { width: 100%; }
    }
`;
