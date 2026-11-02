import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { pageMember } from "@/lib/page-access";

// Private wedding pages are never listed by search engines.
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Logged-in area. proxy.ts only checks that a session exists; this checks the account is
// still alive (pageUser clears a dead session) and has a wedding to show.
export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const { user, member } = await pageMember();
  if (!member) redirect("/onboarding");
  const { wedding, role } = member;
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar
        bride={wedding.brideName}
        groom={wedding.groomName}
        weddingDate={wedding.weddingDate}
        user={user}
        role={role}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
