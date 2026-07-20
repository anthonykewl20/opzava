import type { CSSProperties } from "react";

import {
  fallbackMonogram,
  providerBrands,
  resolveProviderBrand,
  type CanonicalProviderBrand,
} from "@/components/connections/provider-brand-icon";
import { cn } from "@/lib/utils";

export interface ProviderLogoProps {
  readonly providerId: string;
  readonly label: string;
  readonly className?: string;
}

const gatewayAliases: Readonly<Record<string, CanonicalProviderBrand>> = {
  alibaba: "qwen",
  glm: "zai",
  "z-ai": "zai",
  opencode: "opencode-go",
  "opencode-cli": "opencode-go",
} as const;

function gatewayProviderBrand(providerId: string): CanonicalProviderBrand | null {
  const normalized = providerId.trim().toLowerCase();
  return gatewayAliases[normalized] ?? resolveProviderBrand(normalized);
}

/**
 * Browser-safe provider emblem for the Gateway workforce map. Each mark is isolated behind this
 * component so licensed official SVG assets can replace the current local brand geometry later.
 * The adjacent provider text owns the accessible name; the emblem remains decorative.
 */
export function ProviderLogo({ providerId, label, className }: ProviderLogoProps) {
  const canonical = gatewayProviderBrand(providerId);
  const brand = canonical === null ? null : providerBrands[canonical];
  const style = {
    "--gateway-provider-color": brand?.color ?? "var(--fg-subtle)",
    backgroundColor: "var(--gateway-provider-color)",
  } as CSSProperties;
  const sharedProps = {
    "aria-hidden": true,
    "data-provider-brand": canonical ?? "unknown",
    style,
    className: cn(
      "inline-flex size-[38px] shrink-0 items-center justify-center rounded-lg text-white shadow-sm",
      className,
    ),
  } as const;

  if (brand?.kind === "brand") {
    return (
      <span {...sharedProps} data-provider-icon="brand" data-provider-brand-source={brand.source}>
        <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
          <path d={brand.path} />
        </svg>
      </span>
    );
  }

  const monogram =
    brand?.kind === "monogram" ? brand.monogram : fallbackMonogram(label, providerId);
  return (
    <span
      {...sharedProps}
      data-provider-icon="monogram"
      data-provider-brand-source={brand?.source ?? "fallback"}
    >
      <span className="text-sm font-bold leading-none">{monogram}</span>
    </span>
  );
}
