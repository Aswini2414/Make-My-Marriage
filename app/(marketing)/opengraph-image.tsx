import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The link preview for the landing page, e.g. when it's shared on WhatsApp.
// Built once at build time. next/og can't read Tailwind, so the theme colours from
// app/globals.css are repeated here. Fonts are subsets: see assets/og-fonts/README.md.

export const alt = "Make My Marriage: Your wedding, beautifully in order.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const colors = {
  ivory: "#faf8f5",
  surface: "#ffffff",
  plum: "#2a1b3d",
  ink: "#17141c",
  inkSecondary: "#6b6474",
  champagne: "#c8a97e",
  champagneDeep: "#8b6b3e",
};

const font = (file: string) => readFile(join(process.cwd(), "assets/og-fonts", file));

const [
  cormorant,
  cormorantMedium,
  cormorantItalic,
  cormorantSemiboldItalic,
  jakarta,
  jakartaSemibold,
] = await Promise.all([
  font("cormorant-regular.ttf"),
  font("cormorant-medium.ttf"),
  font("cormorant-italic.ttf"),
  font("cormorant-semibold-italic.ttf"),
  font("jakarta-regular.ttf"),
  font("jakarta-semibold.ttf"),
]);

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.ivory,
        backgroundImage:
          "radial-gradient(circle at 50% 0%, rgba(200, 169, 126, 0.22) 0%, rgba(250, 248, 245, 0) 70%)",
        fontFamily: "Jakarta",
        color: colors.ink,
      }}
    >
      <div
        style={{
          display: "flex",
          padding: "8px 22px",
          borderRadius: 999,
          border: `1px solid rgba(200, 169, 126, 0.4)`,
          backgroundColor: colors.surface,
          color: colors.champagneDeep,
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: "0.22em",
        }}
      >
        WEDDING PLANNING, REIMAGINED
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: 36,
          fontFamily: "Cormorant",
          fontSize: 96,
          lineHeight: 1,
          letterSpacing: "-0.015em",
        }}
      >
        <div style={{ display: "flex" }}>Your wedding,</div>
        <div style={{ display: "flex" }}>
          <span style={{ fontStyle: "italic", color: colors.plum }}>beautifully</span>
          <span>&nbsp;in order.</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          maxWidth: 820,
          marginTop: 32,
          fontSize: 28,
          lineHeight: 1.4,
          color: colors.inkSecondary,
          textAlign: "center",
        }}
      >
        Events, guests, RSVPs, expenses and photos for your whole family, in one private workspace.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 48 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 52,
            height: 52,
            borderRadius: 999,
            border: `1px solid ${colors.champagne}`,
            backgroundColor: colors.surface,
            color: colors.plum,
            fontFamily: "Cormorant",
            fontStyle: "italic",
            fontWeight: 600,
            fontSize: 24,
          }}
        >
          Mm
        </div>
        <div style={{ display: "flex", fontFamily: "Cormorant", fontWeight: 500, fontSize: 34 }}>
          Make My Marriage
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Cormorant", data: cormorant, style: "normal", weight: 400 },
        { name: "Cormorant", data: cormorantMedium, style: "normal", weight: 500 },
        { name: "Cormorant", data: cormorantItalic, style: "italic", weight: 400 },
        { name: "Cormorant", data: cormorantSemiboldItalic, style: "italic", weight: 600 },
        { name: "Jakarta", data: jakarta, style: "normal", weight: 400 },
        { name: "Jakarta", data: jakartaSemibold, style: "normal", weight: 600 },
      ],
    },
  );
}
