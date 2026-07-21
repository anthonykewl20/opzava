import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ModelsLoading() {
  return (
    <div className="page mx-auto w-full max-w-[1160px]" aria-busy="true" aria-live="polite">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            AI Runtime
          </span>
          <h1>Models &amp; Providers</h1>
          <p className="page-sub">Loading current model provider and catalog evidence…</p>
        </div>
        <Skeleton className="h-5 w-52 motion-reduce:animate-none" />
      </header>

      <Card className="mb-5 grid grid-cols-1 gap-px overflow-hidden p-0 md:grid-cols-2 xl:grid-cols-4">
        {["connected", "attention", "routable", "lead"].map((id) => (
          <CardContent className="grid min-h-28 gap-3 bg-card p-5" key={id}>
            <Skeleton className="h-3 w-24 motion-reduce:animate-none" />
            <Skeleton className="h-6 w-36 max-w-full motion-reduce:animate-none" />
            <Skeleton className="h-3 w-full motion-reduce:animate-none" />
          </CardContent>
        ))}
      </Card>

      <Skeleton className="mb-6 h-20 w-full rounded-xl motion-reduce:animate-none" />
      <div className="mb-3 flex items-center gap-3">
        <Skeleton className="h-6 w-24 motion-reduce:animate-none" />
        <Skeleton className="h-4 w-40 motion-reduce:animate-none" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {["one", "two", "three", "four", "five", "six"].map((id) => (
          <Card className="min-h-[280px] rounded-xl" key={id}>
            <CardContent className="grid gap-4">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-lg motion-reduce:animate-none" />
                <Skeleton className="h-6 w-32 motion-reduce:animate-none" />
              </div>
              <Skeleton className="h-5 w-36 motion-reduce:animate-none" />
              <Skeleton className="h-4 w-full motion-reduce:animate-none" />
              <Skeleton className="h-4 w-full motion-reduce:animate-none" />
              <Skeleton className="h-2 w-full motion-reduce:animate-none" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
