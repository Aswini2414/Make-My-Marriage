import type { Metadata } from "next";

export const metadata: Metadata = { title: "Photos" };

export default function PhotosPage() {
  return <h1 className="p-8 font-display text-4xl">Photos</h1>;
}
