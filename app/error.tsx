"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/Button";

// Shown when a page fails while loading, such as a database hiccup. Details stay in the logs.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[page] failed to render", error.digest ?? "");
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="label">Something went wrong</p>
      <h1 className="font-display text-4xl">We couldn’t load this page</h1>
      <p className="text-sm text-ink-secondary">
        This is usually temporary. Try again, and if it keeps happening, come back in a few minutes.
      </p>
      <div className="flex items-center gap-4">
        <Button onClick={reset}>Try again</Button>
        <Link href="/dashboard" className="text-sm font-medium text-plum hover:underline">
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
