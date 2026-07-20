import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function GatewayLoading() {
  return (
    <div className="page mx-auto w-full max-w-[1160px]" aria-busy="true" aria-live="polite">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            AI Runtime
          </span>
          <h1>Gateway</h1>
          <p className="page-sub">Loading current Gateway and orchestration evidence…</p>
        </div>
        <Skeleton className="h-5 w-56 motion-reduce:animate-none" />
      </header>

      <Card className="mb-5 grid grid-cols-1 gap-px overflow-hidden p-0 md:grid-cols-2 xl:grid-cols-4">
        {["connection", "orchestrator", "sessions", "auth"].map((id) => (
          <CardContent className="grid min-h-28 gap-3 bg-card p-5" key={id}>
            <Skeleton className="h-3 w-24 motion-reduce:animate-none" />
            <Skeleton className="h-6 w-36 motion-reduce:animate-none" />
            <Skeleton className="h-3 w-full motion-reduce:animate-none" />
          </CardContent>
        ))}
      </Card>

      <Card className="mb-5 min-h-[360px] rounded-[calc(var(--radius-xl)+6px)]">
        <CardContent className="grid gap-6">
          <div className="flex items-center gap-5">
            <Skeleton className="size-16 rounded-xl motion-reduce:animate-none" />
            <div className="grid flex-1 gap-3">
              <Skeleton className="h-7 w-72 max-w-full motion-reduce:animate-none" />
              <Skeleton className="h-4 w-full motion-reduce:animate-none" />
            </div>
          </div>
          <div className="grid gap-px md:grid-cols-3">
            {["one", "two", "three"].map((id) => (
              <Skeleton className="h-28 w-full motion-reduce:animate-none" key={id} />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {["heartbeat", "operator", "usage", "sessions", "control", "recheck"].map((id, index) => (
          <Card
            className={index === 0 || index === 3 ? "min-h-40 md:col-span-2" : "min-h-40"}
            key={id}
          >
            <CardContent className="grid gap-4">
              <Skeleton className="h-4 w-28 motion-reduce:animate-none" />
              <Skeleton className="h-8 w-44 max-w-full motion-reduce:animate-none" />
              <Skeleton className="h-4 w-full motion-reduce:animate-none" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
