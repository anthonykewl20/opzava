import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";

import "./globals.css";

export const metadata: Metadata = {
  title: "Opzava",
  description: "Opzava admin workspace"
};

const themeInitScript = `
(function () {
  try {
    var saved = localStorage.getItem('opzava-mock-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  } catch (error) {
    // localStorage may be unavailable before the app hydrates.
  }
})();
`;

export default function RootLayout({
  children
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
