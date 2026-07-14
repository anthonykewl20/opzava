"use client";

import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function ProviderRulesPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="How model providers work"
          className="size-[22px] text-muted-foreground"
        >
          <Info aria-hidden="true" className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="grid w-80 gap-3 text-sm"
        aria-label="How model providers work"
      >
        <p>
          <strong>Main orchestrator.</strong> Exactly one connected provider leads the fleet. Every
          other connected provider runs as a subagent.
        </p>
        <p>
          <strong>Auth order.</strong> The gateway prefers an OAuth or subscription credential, then
          falls back to an API key.
        </p>
      </PopoverContent>
    </Popover>
  );
}
