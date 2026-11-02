import type { Metadata } from "next";

export const metadata: Metadata = { title: "Money" };

export default function MoneyPage() {
  return <h1 className="p-8 font-display text-4xl">Money</h1>;
}
