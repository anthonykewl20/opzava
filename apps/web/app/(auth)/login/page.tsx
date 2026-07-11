import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getAppSessionContext, isFirstOwnerSetupComplete } from "@/lib/session";

export const dynamic = "force-dynamic";

// The login hero's "team of agents" - the frontier models Opzava orchestrates.
// Simple brand-tinted marks (not exact logos); real names live in the caption.
interface TeamModel {
  readonly name: string;
  readonly color: string;
  readonly glyph: ReactNode;
}

const TEAM_MODELS: readonly TeamModel[] = [
  {
    name: "Claude",
    color: "#D97757",
    glyph: (
      <path
        fill="#D97757"
        d="M12 2.5l1.5 5.4L18 4.9l-2.9 4.6 5.6.9-5.6.9L18 16l-4.5-3L12 18.5 10.5 13 6 16l2.9-5.7L3.3 9.4l5.6-.9L6 3.9l4.5 3.9z"
      />
    ),
  },
  {
    name: "GPT",
    color: "#10A37F",
    glyph: (
      <g fill="none" stroke="#10A37F" strokeWidth="1.5">
        <ellipse cx="12" cy="12" rx="8" ry="3.3" />
        <ellipse cx="12" cy="12" rx="8" ry="3.3" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="8" ry="3.3" transform="rotate(120 12 12)" />
      </g>
    ),
  },
  {
    name: "Gemini",
    color: "#1A73E8",
    glyph: (
      <path
        fill="#1A73E8"
        d="M12 2c.7 5.2 3 7.5 8.2 8.2C15 10.9 12.7 13.2 12 18.4c-.7-5.2-3-7.5-8.2-8.2C9 9.5 11.3 7.2 12 2z"
      />
    ),
  },
  {
    name: "DeepSeek",
    color: "#4D6BFE",
    glyph: (
      <path
        fill="none"
        stroke="#4D6BFE"
        strokeWidth="1.9"
        strokeLinecap="round"
        d="M4 14.5c3 0 3-4.2 6-4.2s3 4.2 6 4.2 4-3.2 4-3.2"
      />
    ),
  },
  {
    name: "Qwen",
    color: "#7B5CF0",
    glyph: (
      <g fill="none" stroke="#7B5CF0" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M12 3l7.5 4.3v9L12 20.6 4.5 16.3v-9z" />
        <circle cx="12" cy="12" r="2.2" fill="#7B5CF0" stroke="none" />
      </g>
    ),
  },
  {
    name: "Kimi",
    color: "#111827",
    glyph: <path fill="#111827" d="M15.5 3.2A9 9 0 1015.5 20.8 7.2 7.2 0 0115.5 3.2z" />,
  },
  {
    name: "GLM",
    color: "#2E6BE6",
    glyph: (
      <path
        fill="none"
        stroke="#2E6BE6"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 7.5h10L7 16.5h10"
      />
    ),
  },
];

export default async function LoginPage() {
  if (!(await isFirstOwnerSetupComplete())) {
    redirect("/setup");
  }

  const session = await getAppSessionContext();
  if (session !== null) {
    redirect("/");
  }

  return (
    <main className="auth-split">
      {/* ── Brand hero - a visual cue that you are entering a workspace where a
          team of AI agents works for you around the clock. Decorative, token-driven
          motion; all motion frozen under prefers-reduced-motion. ── */}
      <aside className="auth-hero">
        <div className="auth-hero-fx" aria-hidden="true">
          <span className="auth-hero-orb auth-hero-orb--1" />
          <span className="auth-hero-orb auth-hero-orb--2" />
          <span className="auth-hero-orb auth-hero-orb--3" />
          <span className="auth-hero-grid" />
          <span className="auth-hero-sheen" />
        </div>
        <div className="auth-hero-content">
          <div className="auth-hero-brand">
            <span className="auth-hero-mark" aria-hidden="true">
              ◆
            </span>
            <span className="auth-hero-word">Opzava</span>
          </div>

          <span className="auth-hero-live">
            <span className="dot" aria-hidden="true" />
            Agents online - 24/7
          </span>

          <div className="auth-hero-copy">
            <h2 className="auth-hero-headline">Run your agents like a team.</h2>
            <p className="auth-hero-sub">
              Step into a workspace where a team of AI agents ships your work - around the clock, so
              you are never the bottleneck.
            </p>
          </div>

          {/* The "team of agents" - the frontier models Opzava orchestrates. */}
          <div className="auth-hero-team">
            <ul className="auth-team" aria-label="AI models on your team">
              {TEAM_MODELS.map((model) => (
                <li
                  key={model.name}
                  className="auth-team-item"
                  style={{ ["--brand" as string]: model.color }}
                >
                  <span className="auth-team-avatar" title={model.name}>
                    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                      {model.glyph}
                    </svg>
                  </span>
                  <span className="auth-team-name">{model.name}</span>
                </li>
              ))}
              <li className="auth-team-item auth-team-item--more" aria-hidden="true">
                <span className="auth-team-avatar auth-team-avatar--more">+</span>
              </li>
            </ul>
            <p className="auth-team-cap">
              Claude, GPT, Gemini, DeepSeek, Qwen, Kimi, GLM and more - your always-on AI team,
              working 24/7.
            </p>
          </div>

          <p className="auth-hero-trust">
            Tool-policy security &middot; tenant-isolated &middot; every action logged
          </p>
        </div>
      </aside>

      {/* ── Sign-in panel ── */}
      <section className="auth-panel" aria-label="Sign in to Opzava">
        <div className="auth-panel-inner">
          <div className="auth-mark" aria-hidden="true">
            ◆
          </div>
          <h1>Welcome back</h1>
          <p className="auth-lead">Sign in to your workspace.</p>

          {/* DESCOPE(social-login): OAuth providers arrive with P8 SSO work.
              Shown as an honest, disabled "Soon" state - never a dead click. */}
          <div className="auth-oauth" aria-label="Provider sign in">
            <button
              className="btn"
              type="button"
              disabled
              aria-disabled="true"
              title="Single sign-on arrives with SSO (P8)"
            >
              <svg className="mark" viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#FFC107"
                  d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
                />
                <path
                  fill="#4CAF50"
                  d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
                />
              </svg>
              <span>Continue with Google</span>
              <span className="auth-oauth-soon">Soon</span>
            </button>
            <button
              className="btn"
              type="button"
              disabled
              aria-disabled="true"
              title="Single sign-on arrives with SSO (P8)"
            >
              <svg className="mark" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                />
              </svg>
              <span>Continue with GitHub</span>
              <span className="auth-oauth-soon">Soon</span>
            </button>
          </div>

          <div className="auth-divider" role="separator" aria-label="or use your email">
            <span>or use your email</span>
          </div>

          <LoginForm />

          <p className="auth-foot">
            First time here? <a href="/setup">Set up Opzava</a>
          </p>
        </div>
      </section>
    </main>
  );
}
