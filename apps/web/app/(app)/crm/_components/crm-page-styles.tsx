const crmPageStyles = `
    /* Page-specific layout only — no color, font-size, shadow, or radius overrides */
    .crm-page {
      max-width: 1320px;
    }
    .crm-page .page-header {
      align-items: center;
      margin-bottom: 0;
    }
    .crm-page-stack,
    .page-stack {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    .crm-header-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .crm-table-card {
      overflow: hidden;
    }
    .crm-table td {
      height: auto;
      padding-top: var(--space-3);
      padding-bottom: var(--space-3);
    }
    .crm-title-link {
      color: var(--fg);
      font-weight: var(--fw-medium);
      line-height: var(--lh-snug);
      text-decoration: none;
    }
    .crm-title-link:hover {
      color: var(--accent);
      text-decoration: none;
    }
    .crm-cell-note {
      margin-top: 6px;
      font-size: var(--text-xs);
    }
    .crm-form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: var(--space-3);
    }
    .crm-form-grid-sm {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: var(--space-3);
    }
    .crm-panel-form {
      display: grid;
      gap: var(--space-3);
      margin-top: var(--space-4);
    }
    .crm-new-menu {
      position: relative;
    }
    .crm-new-menu summary {
      list-style: none;
    }
    .crm-new-menu summary::-webkit-details-marker {
      display: none;
    }
    .crm-new-form {
      position: absolute;
      z-index: var(--z-dropdown);
      right: 0;
      display: flex;
      width: min(420px, 86vw);
      flex-direction: column;
      gap: var(--space-3);
      margin-top: var(--space-2);
      padding: var(--space-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface);
      box-shadow: var(--shadow-md);
    }
    .crm-new-menu summary:focus-visible,
    .crm-title-link:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .crm-detail-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.75fr);
      gap: var(--space-4);
      align-items: start;
    }
    .crm-detail-main,
    .crm-detail-side {
      min-width: 0;
    }
    .crm-profile-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: var(--space-3);
    }
    .crm-profile-list dt {
      font-size: var(--text-xs);
      text-transform: uppercase;
      letter-spacing: var(--tracking-caps);
      font-weight: var(--fw-semibold);
    }
    .crm-profile-list dd {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .crm-section-actions {
      display: flex;
      gap: var(--space-2);
      flex-wrap: wrap;
      margin-bottom: var(--space-4);
    }
    .crm-list-stack {
      display: grid;
      gap: var(--space-3);
    }
    .crm-linked-item {
      padding: var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface-2);
      min-width: 0;
    }
    .crm-linked-item strong {
      color: var(--fg);
      font-weight: var(--fw-medium);
      line-height: var(--lh-snug);
      overflow-wrap: anywhere;
    }
    .crm-timeline {
      display: grid;
      gap: var(--space-3);
    }
    .crm-timeline-item {
      display: grid;
      grid-template-columns: 32px 1fr;
      gap: var(--space-3);
      min-width: 0;
    }
    .crm-timeline-body {
      min-width: 0;
    }
    .crm-timeline-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .crm-timeline-copy {
      margin-top: var(--space-1);
      overflow-wrap: anywhere;
    }
    .count-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 22px;
      padding: 0 8px;
      border: 1px solid var(--border);
      border-radius: var(--radius-full);
      background: var(--surface-2);
      color: var(--fg-subtle);
      font-size: var(--text-xs);
      font-weight: var(--fw-medium);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .count-pill-accent {
      border-color: var(--accent-border);
      background: var(--accent-soft);
      color: var(--accent);
    }
    .crm-deals-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
      gap: var(--space-4);
      align-items: start;
    }
    .crm-deals-board.board-columns {
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }
    .crm-deal-card.ct-card {
      cursor: default;
    }
    .ct-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-top: 3px solid var(--card-color, var(--border));
      border-radius: var(--radius-lg);
      padding: var(--space-3) var(--space-4) var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
      transition: box-shadow var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-standard);
    }
    .ct-card:hover {
      box-shadow: var(--shadow-md);
      transform: translateY(-1px);
    }
    .ct-card-top {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .ct-card-id {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--fg-subtle);
      font-weight: var(--fw-medium);
      white-space: nowrap;
    }
    .ct-card-age {
      font-size: var(--text-xs);
      color: var(--fg-subtle);
      white-space: nowrap;
    }
    .ct-card-labels {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .ct-label {
      font-size: var(--text-xs);
      font-weight: var(--fw-medium);
      color: var(--fg-muted);
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-full);
      padding: 1px 9px;
      overflow-wrap: anywhere;
    }
    .ct-card-title {
      font-size: var(--text-base);
      font-weight: var(--fw-medium);
      color: var(--fg);
      line-height: var(--lh-snug);
      overflow-wrap: anywhere;
    }
    .ct-card-foot {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-top: 2px;
      min-width: 0;
    }
    .ct-mini {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: var(--text-xs);
      color: var(--fg-subtle);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .ct-add {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      width: 100%;
      padding: var(--space-3);
      border: 1px dashed var(--border-strong);
      border-radius: var(--radius-lg);
      background: none;
      color: var(--fg-subtle);
      font: inherit;
      font-size: var(--text-sm);
      text-decoration: none;
      transition: background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard);
    }
    .ct-add:hover {
      background: var(--surface-2);
      color: var(--fg-muted);
      text-decoration: none;
    }
    .crm-ticket-status-form,
    .crm-deal-move-form {
      display: flex;
      gap: var(--space-2);
      align-items: center;
    }
    .crm-deal-close-actions {
      display: grid;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }
    .crm-closed-list article + article {
      padding-top: var(--space-3);
      border-top: 1px solid var(--border);
    }
    .crm-state-card {
      overflow: hidden;
    }
    @media (max-width: 860px) {
      .crm-detail-grid,
      .crm-deals-layout {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 640px) {
      .crm-page .page-header {
        align-items: stretch;
      }
      .crm-new-form {
        position: static;
        width: 100%;
      }
      .crm-ticket-status-form,
      .crm-deal-move-form,
      .crm-timeline-head {
        align-items: stretch;
        flex-direction: column;
      }
    }
`;

export function CrmPageStyles() {
  return <style>{crmPageStyles}</style>;
}

export function CrmPlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
