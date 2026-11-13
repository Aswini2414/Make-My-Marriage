import localFont from "next/font/local";

// The landing page follows its Stitch design, which uses these two fonts.
// Every other page keeps Instrument Serif and Inter from the root layout.

// Local files, like the root layout's fonts: see assets/fonts. Each is a variable font.
const cormorant = localFont({
  variable: "--font-cormorant",
  display: "swap",
  src: [
    {
      path: "../../assets/fonts/cormorant-garamond-variable.woff2",
      weight: "300 700",
      style: "normal",
    },
    {
      path: "../../assets/fonts/cormorant-garamond-italic-variable.woff2",
      weight: "300 700",
      style: "italic",
    },
  ],
});

const jakarta = localFont({
  variable: "--font-jakarta",
  display: "swap",
  src: [
    {
      path: "../../assets/fonts/plus-jakarta-sans-variable.woff2",
      weight: "200 800",
      style: "normal",
    },
  ],
});

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`${cormorant.variable} ${jakarta.variable} flex flex-1 flex-col font-landing`}>
      {children}
    </div>
  );
}
