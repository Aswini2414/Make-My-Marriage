import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { ResetPanel } from "@/components/auth/panels";

export const metadata: Metadata = { title: "Forgot your password?" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell panel={<ResetPanel />}>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
