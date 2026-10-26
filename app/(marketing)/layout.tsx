import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";

// The landing page follows its Stitch design, which uses these two fonts.
// Every other page keeps Instrument Serif and Inter from the root layout.

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
});

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`${cormorant.variable} ${jakarta.variable} flex flex-1 flex-col font-landing`}>
      {children}
    </div>
  );
}
