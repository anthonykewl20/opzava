import { readFile } from "node:fs/promises";

import type { CrmAccountDto, CrmDealDto, CrmTicketDto } from "@opzava/crm";
import { describe, expect, it } from "vitest";

import {
  accountOpenDealCount,
  accountOpenTicketCount,
  dealStatusBadgeClassName,
  dealStatusLabel,
  formatMoney,
  lifecycleBadgeClassName,
  lifecycleLabel,
  ownerLabel,
  ticketPriorityBadgeClassName,
  ticketPriorityLabel,
  ticketStatusBadgeClassName,
  ticketStatusLabel,
} from "../lib/crm-pages";
import type { AppSessionContext } from "../lib/session";

async function readRepoFile(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function context(): AppSessionContext {
  return {
    sessionId: "session-1",
    user: { id: "user-1", email: "anthony@example.test", name: "Anthony" },
    orgId: "org-1",
    organizationName: "Opzava",
    organizationLifecycleState: "active",
    workspaceId: "workspace-1",
    workspaceName: "Admin",
    roleKeys: ["admin"],
  };
}

describe("CRM page state", () => {
  it("maps CRM statuses, priorities, lifecycle stages, ownership, and money labels", () => {
    expect(lifecycleLabel("qualified")).toBe("Qualified");
    expect(lifecycleBadgeClassName("customer")).toBe("badge badge-success");
    expect(dealStatusLabel("lost")).toBe("Lost");
    expect(dealStatusBadgeClassName("open")).toBe("badge badge-accent");
    expect(ticketStatusLabel("waiting_on_customer")).toBe("Waiting");
    expect(ticketStatusBadgeClassName("new")).toBe("badge badge-accent");
    expect(ticketPriorityLabel("urgent")).toBe("Urgent");
    expect(ticketPriorityBadgeClassName("high")).toBe("badge badge-warning");
    expect(ownerLabel("user-1", context())).toBe("Anthony");
    expect(ownerLabel(null, context())).toBe("Unassigned");
    expect(formatMoney(129900, "USD")).toBe("$1,299.00");
    expect(formatMoney(null, "USD")).toBe("No value");
  });

  it("counts account work without treating resolved tickets as active", () => {
    const account = { id: "account-1" } as CrmAccountDto;
    const openDeal = { accountId: "account-1", status: "open" } as CrmDealDto;
    const otherDeal = { accountId: "account-2", status: "open" } as CrmDealDto;
    const openTicket = { accountId: "account-1", status: "open" } as CrmTicketDto;
    const resolvedTicket = { accountId: "account-1", status: "resolved" } as CrmTicketDto;
    const otherTicket = { accountId: "account-2", status: "open" } as CrmTicketDto;

    expect(accountOpenDealCount(account, [openDeal, otherDeal])).toBe(1);
    expect(accountOpenTicketCount(account, [openTicket, resolvedTicket, otherTicket])).toBe(1);
  });

  it("wires CRM pages to the remediated mockup class contract and live actions", async () => {
    const [
      styles,
      contacts,
      contactDetail,
      accounts,
      accountDetail,
      deals,
      tickets,
      ticketDetail,
      loading,
      forbidden,
      error,
    ] = await Promise.all([
      readRepoFile("app/(app)/crm/_components/crm-page-styles.tsx"),
      readRepoFile("app/(app)/crm/contacts/page.tsx"),
      readRepoFile("app/(app)/crm/contacts/[id]/page.tsx"),
      readRepoFile("app/(app)/crm/accounts/page.tsx"),
      readRepoFile("app/(app)/crm/accounts/[id]/page.tsx"),
      readRepoFile("app/(app)/crm/deals/page.tsx"),
      readRepoFile("app/(app)/crm/tickets/page.tsx"),
      readRepoFile("app/(app)/crm/tickets/[id]/page.tsx"),
      readRepoFile("app/(app)/crm/loading.tsx"),
      readRepoFile("app/(app)/crm/forbidden.tsx"),
      readRepoFile("app/(app)/crm/error.tsx"),
    ]);

    expect(styles).toContain(
      "Page-specific layout only — no color, font-size, shadow, or radius overrides",
    );
    expect(styles).toContain(".ct-card");
    expect(styles).toContain(".count-pill");
    expect(styles).toContain(".crm-detail-grid");
    expect(styles).toContain(".crm-table td");

    for (const page of [
      contacts,
      contactDetail,
      accounts,
      accountDetail,
      deals,
      tickets,
      ticketDetail,
      loading,
      forbidden,
      error,
    ]) {
      expect(page).toContain("CrmPageStyles");
      expect(page).toContain("page crm-page");
    }

    expect(contacts).toContain('className="table table-compact table-cards crm-table"');
    expect(contacts).toContain("createContactAction");
    expect(contacts).toContain("web.crm.contact.create");
    expect(accounts).toContain('className="table table-compact table-cards crm-table"');
    expect(accounts).toContain("createAccountAction");
    expect(accounts).toContain("web.crm.account.create");

    expect(deals).toContain('className="board-columns crm-deals-board"');
    expect(deals).toContain('className="board-col"');
    expect(deals).toContain('className="board-col-header"');
    expect(deals).toContain("moveDealStageAction");
    expect(deals).toContain("closeDealAction");
    expect(deals).toContain("reopenDealAction");

    expect(tickets).toContain('className="tabs"');
    expect(tickets).toContain('className="table table-compact table-cards crm-table"');
    expect(tickets).toContain("updateTicketStatusAction");
    expect(ticketDetail).toContain("updateTicketAction");

    expect(contactDetail).toContain("addContactActivityAction");
    expect(contactDetail).toContain('className="crm-timeline"');
    expect(contactDetail).toContain("DESCOPE(crm-consent-erasure)");
    expect(accountDetail).toContain("DESCOPE(crm-account-health)");
    expect(ticketDetail).toContain("DESCOPE(external-channel-transcript)");
  });
});
