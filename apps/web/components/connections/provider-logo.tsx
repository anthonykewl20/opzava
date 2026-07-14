import type { CSSProperties } from "react";

import {
  fallbackMonogram,
  providerBrands,
  resolveProviderBrand,
} from "@/components/connections/provider-brand-icon";
import { cn } from "@/lib/utils";

export interface ProviderLogoProps {
  readonly providerId: string;
  readonly label: string;
  readonly className?: string;
}

export function ProviderLogo({ providerId, label, className }: ProviderLogoProps) {
  const canonical = resolveProviderBrand(providerId);
  const brand = canonical === null ? null : providerBrands[canonical];
  const style = {
    "--provider-brand": brand?.color ?? "var(--muted-foreground)",
    backgroundColor: "color-mix(in oklab, var(--provider-brand) 16%, var(--muted))",
  } as CSSProperties;
  const sharedProps = {
    "aria-hidden": true,
    "data-provider-brand": canonical ?? "unknown",
    style,
    className: cn(
      "inline-flex size-[38px] shrink-0 items-center justify-center rounded-md text-foreground",
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
      <span className="text-sm font-semibold leading-none">{monogram}</span>
    </span>
  );
}
