import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PasskeyFeedback, loginFeedbackMessage } from "../components/auth/login-form";

describe("LoginForm passkey feedback", () => {
  it("renders a passkey action failure in the form error area", () => {
    const html = renderToStaticMarkup(<PasskeyFeedback message="Passkey authentication is unavailable. Try your password instead." />);

    expect(html).toContain('role="alert"');
    expect(html).toContain("Passkey authentication is unavailable. Try your password instead.");
  });

  it("prefers passkey feedback over a stale password failure while a passkey attempt is active", () => {
    expect(loginFeedbackMessage({
      passwordError: "The email or password is incorrect.",
      passkeyError: undefined,
      passkeyPending: true
    })).toBeUndefined();
    expect(loginFeedbackMessage({
      passwordError: "The email or password is incorrect.",
      passkeyError: "Passkey sign-in is unavailable. Try your password instead.",
      passkeyPending: false
    })).toBe("Passkey sign-in is unavailable. Try your password instead.");
  });

  it("shows the password error and clears passkey feedback after a failed passkey attempt is followed by a failed password submit", () => {
    const passkeyFailure = loginFeedbackMessage({
      passwordError: undefined,
      passkeyError: "That passkey could not be verified. Try again or use your password.",
      passkeyPending: false
    });
    expect(passkeyFailure).toBe("That passkey could not be verified. Try again or use your password.");

    const afterPasswordSubmit = loginFeedbackMessage({
      passwordError: "Wrong email or password. Check both and try again, or reset your password.",
      passkeyError: undefined,
      passkeyPending: false
    });
    expect(afterPasswordSubmit).toBe("Wrong email or password. Check both and try again, or reset your password.");
    expect(renderToStaticMarkup(<PasskeyFeedback message={afterPasswordSubmit} />)).not.toContain("passkey");
  });
});
