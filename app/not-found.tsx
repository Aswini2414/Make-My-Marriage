import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="label">Not found</p>
      <h1 className="font-display text-4xl">This page doesn&apos;t exist</h1>
      <Link href="/" className="text-plum underline underline-offset-4">
        Go home
      </Link>
    </main>
  );
}
