import type { Metadata } from "next";

export const metadata: Metadata = { title: "Guests" };

export default function GuestsPage() {
  return <h1 className="p-8 font-display text-4xl">Guests</h1>;
}
