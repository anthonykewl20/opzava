import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ConnectionsLoading() {
  return (
    <div className="page connections-page" aria-busy="true" aria-live="polite">
      <div className="page-stack">
        <div className="page-header connections-header">
          <div>
            <h1>Connections</h1>
            <p className="page-sub">Loading current Opzava health and connections…</p>
          </div>
        </div>

        <Card aria-labelledby="connections-overview-loading-title">
          <CardHeader className="border-b">
            <h2 id="connections-overview-loading-title" className="font-semibold">
              System health
            </h2>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Skeleton className="h-8 w-64 max-w-full motion-reduce:animate-none" />
            <Skeleton className="h-4 w-full max-w-xl motion-reduce:animate-none" />
            <Skeleton className="h-3 w-full rounded-full motion-reduce:animate-none" />
            <div className="grid gap-2 md:grid-cols-3">
              {["system", "channels", "agents"].map((id) => (
                <Skeleton
                  className="h-11 w-full rounded-full motion-reduce:animate-none"
                  key={id}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <div
          className="grid grid-cols-1 gap-6 lg:grid-cols-3"
          aria-label="Loading connection cards"
        >
          {["gateway", "providers", "integrations"].map((id) => (
            <Card key={id}>
              <CardHeader className="border-b">
                <Skeleton className="h-5 w-40 motion-reduce:animate-none" />
              </CardHeader>
              <CardContent className="grid gap-4">
                <Skeleton className="h-8 w-28 motion-reduce:animate-none" />
                <Skeleton className="h-4 w-full motion-reduce:animate-none" />
                <Skeleton className="h-24 w-full motion-reduce:animate-none" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
