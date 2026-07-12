import type { ReactNode } from "react";

import { connectionsPageStyles } from "@/app/(app)/connections/_lib/page-styles";

export const dynamic = "force-dynamic";

function ConnectionsPageStyles() {
  return <style>{connectionsPageStyles}</style>;
}

export default function ConnectionsLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="page connections-page">
      <ConnectionsPageStyles />
      <div className="page-stack">{children}</div>
    </div>
  );
}
