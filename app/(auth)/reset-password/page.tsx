import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { ResetPanel } from "@/components/auth/panels";

export const metadata: Metadata = {
  title: "Set a new password",
  // The link carries a secret token, so don't send it on to other sites.
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  return (
    <AuthShell panel={<ResetPanel />}>
      <ResetPasswordForm token={typeof token === "string" ? token : undefined} />
    </AuthShell>
  );
}
