import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ConnectionsLoading() {
  return (
    <div className="page connections-page" aria-busy="true" aria-live="polite">
      <div className="page-stack">
        <div className="page-header connections-header">
          <div>
            <h1>Connections</h1>
            <p className="page-sub">Loading live gateway and provider status...</p>
          </div>
          <Skeleton className="h-9 w-32" />
        </div>

        <section className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Model providers</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-full max-w-md" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Opzava Gateway</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-4 w-full max-w-sm" />
            </CardContent>
          </Card>
        </section>

        <Card aria-labelledby="providers-loading-title">
          <CardHeader>
            <CardTitle id="providers-loading-title">Provider connection status</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {["openai", "anthropic", "zai"].map((id) => (
              <div className="grid gap-2 rounded-lg border border-border p-4" key={id}>
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-8 w-24" />
                </div>
                <Skeleton className="h-4 w-full max-w-lg" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
