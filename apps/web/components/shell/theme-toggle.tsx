"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "opzava-mock-theme";
export const THEME_CHANGE_EVENT = "opzava-theme-change";

export type ThemePreference = "light" | "dark" | "system";

export function normalizeThemePreference(value: string | null): ThemePreference {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }

  if (value === "calm") {
    return "light";
  }

  if (value === "hc") {
    return "dark";
  }

  return "system";
}

export function resolveThemePreference(
  preference: ThemePreference,
  prefersDark: boolean,
  lightVariant: string = "light",
): string {
  if (preference === "dark" || (preference === "system" && prefersDark)) {
    return "dark";
  }

  return lightVariant;
}

export function isDarkTheme(theme: string) {
  return theme === "dark" || theme === "hc";
}

export function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "dark";
}

export function currentThemePreference(): ThemePreference {
  const rootPreference = document.documentElement.getAttribute("data-theme-preference");
  if (rootPreference !== null) {
    return normalizeThemePreference(rootPreference);
  }

  try {
    return normalizeThemePreference(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

function currentLightVariant(): string {
  const root = document.documentElement;
  return root.getAttribute("data-light") || (currentTheme() === "calm" ? "calm" : "light");
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}

export function setThemePreference(nextTheme: ThemePreference): string {
  const root = document.documentElement;
  const appliedTheme = resolveThemePreference(
    nextTheme,
    systemPrefersDark(),
    currentLightVariant(),
  );

  root.setAttribute("data-theme", appliedTheme);
  root.setAttribute("data-theme-preference", nextTheme);
  try {
    localStorage.setItem(THEME_KEY, nextTheme);
  } catch {
    /* localStorage can be unavailable in private or embedded contexts. */
  }

  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  return appliedTheme;
}

export function toggleThemePreference(): string {
  return setThemePreference(isDarkTheme(currentTheme()) ? "light" : "dark");
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    setPreference(currentThemePreference());

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function syncTheme() {
      setPreference(currentThemePreference());
    }
    function syncSystemTheme() {
      if (currentThemePreference() === "system") {
        setThemePreference("system");
      }
    }

    window.addEventListener(THEME_CHANGE_EVENT, syncTheme);
    media.addEventListener("change", syncSystemTheme);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
      media.removeEventListener("change", syncSystemTheme);
    };
  }, []);

  function setTheme(nextTheme: ThemePreference) {
    setPreference(nextTheme);
    setThemePreference(nextTheme);
  }

  const segments = [
    { mode: "light" as const, icon: "☀", label: "Light mode" },
    { mode: "dark" as const, icon: "☾", label: "Dark mode" },
    { mode: "system" as const, icon: "◐", label: "System mode" },
  ];

  return (
    <div
      id="theme-switch"
      role="group"
      aria-label="Appearance"
      style={{
        display: "inline-flex",
        alignItems: "center",
        position: "relative",
        fontFamily: "var(--font-sans)",
        flex: "none",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 2,
          padding: 3,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 9999,
        }}
      >
        {segments.map((segment) => {
          const active = segment.mode === preference;

          return (
            <button
              key={segment.mode}
              type="button"
              data-seg={segment.mode}
              aria-label={segment.label}
              aria-pressed={active}
              title={segment.label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 30,
                height: 30,
                border: 0,
                borderRadius: 9999,
                background: active ? "var(--surface)" : "none",
                color: active ? "var(--accent)" : "var(--fg-muted)",
                fontSize: 15,
                lineHeight: 1,
                cursor: "pointer",
                transition: "background 140ms ease,color 140ms ease,box-shadow 140ms ease",
                boxShadow: active ? "var(--shadow-sm)" : "none",
              }}
              onClick={() => setTheme(segment.mode)}
              onMouseEnter={(event) => {
                if (event.currentTarget.getAttribute("aria-pressed") !== "true") {
                  event.currentTarget.style.color = "var(--fg)";
                }
              }}
              onMouseLeave={(event) => {
                if (event.currentTarget.getAttribute("aria-pressed") !== "true") {
                  event.currentTarget.style.color = "var(--fg-muted)";
                }
              }}
            >
              {segment.icon}
            </button>
          );
        })}
      </div>
    </div>
  );
}
