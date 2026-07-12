import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function GatewayConnectionsLoading() {
  return (
    <div className="page connections-page" aria-busy="true" aria-live="polite">
      <div className="page-stack">
        <div className="page-header connections-header">
          <div>
            <h1>Gateway health</h1>
            <p className="page-sub">Loading gateway diagnostics...</p>
          </div>
          <div className="connections-header-actions">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>

        <Card aria-labelledby="gateway-loading-title">
          <CardHeader>
            <CardTitle id="gateway-loading-title">Status &amp; diagnostics</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {[0, 1, 2, 3, 4].map((row) => (
              <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-4" key={row}>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full max-w-md" />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-6 w-36" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
