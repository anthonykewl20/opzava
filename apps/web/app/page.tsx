import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-6 py-12">
      <section className="space-y-4">
        <p className="text-sm font-medium text-muted-foreground">Foundation boot</p>
        <h1 className="text-4xl font-semibold tracking-normal text-foreground md:text-6xl">
          Opzava
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          APP_URL: <span className="font-mono text-foreground">{env.APP_URL}</span>
        </p>
      </section>
      <div>
        <Button type="button">Boot OK</Button>
      </div>
    </main>
  );
}
