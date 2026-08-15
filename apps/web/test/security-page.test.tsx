import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SecurityPageContent, passkeysForSecurityPage } from "../app/(auth)/security/page";

describe("SecurityPage passkey configuration", () => {
  it("keeps password and MFA available when passkeys are unavailable", () => {
    const passkeys = passkeysForSecurityPage({ ok: false, error: { code: "auth.passkeyUnavailable" } });
    const html = renderToStaticMarkup(<SecurityPageContent enabled={false} remaining={0} passkeys={passkeys} />);

    expect(html).toContain("Change password");
    expect(html).toContain("Enable two-factor");
    expect(html).toContain("Passkeys are not configured on this deployment.");
    expect(html).not.toContain('id="passkeys-heading"');
  });
});
