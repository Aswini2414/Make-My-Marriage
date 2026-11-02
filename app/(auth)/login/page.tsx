import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { LoginPanel } from "@/components/auth/panels";
import { MailIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <AuthShell panel={<LoginPanel />}>
      <AuthHeading
        variant="login"
        eyebrow="Welcome back"
        title="Log in to your wedding"
        subtitle="Use the email and password you signed up with."
      />
      <LoginForm next={typeof next === "string" ? next : undefined} />
      <p className="mt-5 text-center text-xs text-ink-secondary">
        New to Make My Marriage?{" "}
        <Link href="/signup" className="tap-area ml-1 font-medium text-plum hover:underline">
          Create an account
        </Link>
      </p>
      <div className="my-8 h-px w-full bg-border" />
      <div className="flex items-start gap-3.5 rounded-card border border-border/70 bg-lilac p-4">
        <MailIcon className="mt-0.5 shrink-0 text-base text-plum" />
        <p className="text-xs leading-relaxed text-ink-secondary">
          <strong className="font-semibold text-ink">Are you a guest?</strong> You don&apos;t need
          an account. Open the personal link in your invitation email.
        </p>
      </div>
    </AuthShell>
  );
}
