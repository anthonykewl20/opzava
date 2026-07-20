import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppSidebar } from "../components/shell/app-sidebar";
import { SidebarProvider } from "../components/ui/sidebar";
import { buildAdminNavModel } from "../lib/admin-registry";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

const model = buildAdminNavModel({ roleKeys: ["admin"] });

function renderSidebar(pathname = "/"): string {
  navigation.pathname = pathname;

  return renderToStaticMarkup(
    createElement(SidebarProvider, null, createElement(AppSidebar, { model })),
  );
}

describe("Registry-driven Admin sidebar", () => {
  it("renders the pinned assistant and four registry groups in exact information-architecture order", () => {
    const html = renderSidebar();

    const labels = [
      "Ask Admin Opzava",
      "Develop",
      "Overview",
      "Dev Board",
      "Runners",
      "Environments",
      "AI Runtime",
      "Gateway",
      "Models &amp; Providers",
      "Agents",
      "Runtime Skills",
      "Sessions &amp; Runs",
      "Automations",
      "Operate",
      "Health",
      "Incidents",
      "Logs",
      "Usage &amp; Costs",
      "Configure",
      "Integrations",
      "Engineering Skills",
      "MCP Servers",
      "Secrets",
      "Security &amp; Audit",
      "Settings",
    ];
    const positions = labels.map((label) => html.indexOf(label));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it("keeps built routes navigable and renders every unbuilt destination disabled with Soon status", () => {
    const html = renderSidebar();

    expect(html).toContain('href="/"');
    expect(html).toContain('href="/ask-opzava"');
    expect(html).toContain('href="/dev-board"');
    expect(html).not.toContain('href="/runners"');
    expect(html).not.toContain('href="/settings"');
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(18);
    expect(html.match(/>Soon</g)).toHaveLength(18);
  });

  it("preserves one clearly labelled transitional Connections link", () => {
    const html = renderSidebar();

    expect(html.match(/href="\/connections"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Connections (legacy)"');
    expect(html).toContain(">Legacy</div>");
  });

  it.each([
    ["/", 'aria-label="Overview" aria-current="page"'],
    ["/ask-opzava/thread/1", 'aria-label="Ask Admin Opzava" aria-current="page"'],
    ["/dev-board/ticket/260", 'aria-label="Dev Board" aria-current="page"'],
    ["/connections/providers", 'aria-label="Connections (legacy)" aria-current="page"'],
  ])("marks the matching route active for %s", (pathname, activeMarkup) => {
    const html = renderSidebar(pathname);

    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain(activeMarkup);
  });
});
