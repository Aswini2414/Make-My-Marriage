import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";
import { SignupPanel } from "@/components/auth/panels";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <AuthShell panel={<SignupPanel />}>
      <SignupForm />
    </AuthShell>
  );
}
