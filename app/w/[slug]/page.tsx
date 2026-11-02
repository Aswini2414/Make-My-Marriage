import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connectDb } from "@/lib/db";
import { Wedding } from "@/modules/weddings/model";

// Public wedding website, rendered on the server. Built in Phase 7.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function WeddingWebsitePage(props: PageProps<"/w/[slug]">) {
  const { slug } = await props.params;
  // An address nobody uses is a 404, not an empty page.
  await connectDb();
  if (!(await Wedding.exists({ slug }))) notFound();
  return <h1 className="font-display text-4xl">Wedding website: {slug}</h1>;
}
