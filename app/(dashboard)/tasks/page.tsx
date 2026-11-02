import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return <h1 className="p-8 font-display text-4xl">Tasks</h1>;
}
