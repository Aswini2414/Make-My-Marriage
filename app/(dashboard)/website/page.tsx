import type { Metadata } from "next";

export const metadata: Metadata = { title: "Website" };

export default function WebsitePage() {
  return <h1 className="p-8 font-display text-4xl">Website</h1>;
}
