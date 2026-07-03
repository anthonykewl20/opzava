"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "opzava-mock-theme";

function isDarkTheme(theme: string) {
  return theme === "dark" || theme === "hc";
}

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "dark";
}

export function ThemeToggle() {
  const [theme, setThemeState] = useState("dark");

  useEffect(() => {
    setThemeState(currentTheme());
  }, []);

  function setTheme(nextTheme: "light" | "dark") {
    const root = document.documentElement;
    const pageDefault = root.getAttribute("data-theme") || "dark";
    const lightVariant = root.getAttribute("data-light") || (pageDefault === "calm" ? "calm" : "light");
    const appliedTheme = nextTheme === "dark" ? "dark" : lightVariant;

    root.setAttribute("data-theme", appliedTheme);
    try {
      localStorage.setItem(THEME_KEY, appliedTheme);
    } catch {
      /* localStorage can be unavailable in private or embedded contexts. */
    }
    setThemeState(appliedTheme);
  }

  const segments = [
    { mode: "light" as const, icon: "☀", label: "Light mode" },
    { mode: "dark" as const, icon: "☾", label: "Dark mode" },
  ];

  return (
    <div
      id="theme-switch"
      role="group"
      aria-label="Theme"
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
          const active =
            segment.mode === "dark" ? isDarkTheme(theme) : !isDarkTheme(theme);

          return (
            <button
              key={segment.mode}
              type="button"
              data-seg={segment.mode}
              aria-label={segment.label}
              aria-pressed={active ? "true" : "false"}
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
