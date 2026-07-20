import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";

import "./globals.css";

export const metadata: Metadata = {
  title: "Opzava",
  description: "Opzava admin workspace",
};

const themeInitScript = `
(function () {
  try {
    var saved = localStorage.getItem('opzava-mock-theme');
    var preference = saved === 'light' || saved === 'dark' || saved === 'system'
      ? saved
      : saved === 'calm'
        ? 'light'
        : saved === 'hc'
          ? 'dark'
          : 'system';
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var lightVariant = document.documentElement.getAttribute('data-light') ||
      (saved === 'calm' ? 'calm' : 'light');
    var applied = preference === 'dark' || (preference === 'system' && prefersDark)
      ? (saved === 'hc' && preference === 'dark' ? 'hc' : 'dark')
      : lightVariant;
    document.documentElement.setAttribute('data-theme', applied);
    document.documentElement.setAttribute('data-theme-preference', preference);
  } catch (error) {
    // localStorage may be unavailable before the app hydrates.
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <Script
          id="mockup-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        {children}
      </body>
    </html>
  );
}
