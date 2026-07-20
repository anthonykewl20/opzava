import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function HealthLoading() {
  return (
    <div className="page mx-auto w-full max-w-[1120px]" aria-busy="true" aria-live="polite">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Operate
          </span>
          <h1>Health</h1>
          <p className="page-sub">Loading current platform health evidence…</p>
        </div>
        <Skeleton className="h-5 w-44 motion-reduce:animate-none" />
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="min-h-[420px] md:col-span-2 md:row-span-2">
          <CardContent className="grid h-full place-items-center gap-5">
            <Skeleton className="size-44 rounded-full motion-reduce:animate-none" />
            <Skeleton className="h-6 w-64 max-w-full motion-reduce:animate-none" />
            <Skeleton className="h-4 w-80 max-w-full motion-reduce:animate-none" />
          </CardContent>
        </Card>
        <Card className="min-h-44 md:col-span-2">
          <CardContent className="grid gap-4">
            <Skeleton className="h-8 w-56 max-w-full motion-reduce:animate-none" />
            <Skeleton className="h-16 w-full motion-reduce:animate-none" />
          </CardContent>
        </Card>
        {["gateway", "runtime"].map((id) => (
          <Card className="min-h-36" key={id}>
            <CardContent className="grid gap-4">
              <Skeleton className="h-4 w-24 motion-reduce:animate-none" />
              <Skeleton className="h-7 w-32 motion-reduce:animate-none" />
              <Skeleton className="h-4 w-full motion-reduce:animate-none" />
            </CardContent>
          </Card>
        ))}
        <Card className="min-h-36 md:col-span-2">
          <CardContent className="grid gap-4">
            <Skeleton className="h-4 w-36 motion-reduce:animate-none" />
            <Skeleton className="h-8 w-full motion-reduce:animate-none" />
          </CardContent>
        </Card>
      </div>

      <Skeleton className="mt-5 h-14 w-full motion-reduce:animate-none" />
    </div>
  );
}
