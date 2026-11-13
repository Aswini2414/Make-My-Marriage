import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { appUrl } from "@/lib/env";
import "./globals.css";

// The fonts are files in assets/fonts (the Latin subset of Instrument Serif and Inter, as served
// by Google Fonts), not downloaded by next/font/google. A dev server or build with no route to
// fonts.gstatic.com then still starts, instead of failing every page with "module not found".
const instrumentSerif = localFont({
  variable: "--font-instrument-serif",
  display: "swap",
  src: [
    { path: "../assets/fonts/instrument-serif-400.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/instrument-serif-400-italic.woff2", weight: "400", style: "italic" },
  ],
});

// One variable file covers every weight.
const inter = localFont({
  variable: "--font-inter",
  display: "swap",
  src: [{ path: "../assets/fonts/inter-variable.woff2", weight: "100 900", style: "normal" }],
});

export const metadata: Metadata = {
  // Lets link previews and other metadata use paths such as "/opengraph-image".
  metadataBase: new URL(appUrl()),
  title: { default: "Make My Marriage", template: "%s · Make My Marriage" },
  description: "Plan your whole wedding in one place.",
};

export const viewport: Viewport = {
  themeColor: "#faf8f5",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
