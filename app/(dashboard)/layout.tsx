// Logged-in area. proxy.ts redirects to /login without a session; the Sidebar and
// PageHeader components replace this shell in Phase 1.
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>;
}
