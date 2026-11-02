import type { Metadata } from "next";

// Login and account pages have nothing for search engines. Each page draws its own
// split screen with AuthShell.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return children;
}
