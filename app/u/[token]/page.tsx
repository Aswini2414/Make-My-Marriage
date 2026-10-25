import type { Metadata } from "next";

// QR photo upload page: server shell, browser-side compression and upload. Built in Phase 8.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function UploadPage() {
  return <h1 className="font-display text-4xl">Share your photos</h1>;
}
