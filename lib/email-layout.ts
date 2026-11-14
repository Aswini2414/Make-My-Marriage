import { escapeHtml } from "@/lib/html";

// The one layout every email uses (password reset, member invite, wedding invitation, reminder),
// so spacing, colours and the footer live in one place. Calm, ivory and plum, like the app.
//
// Rules for email HTML that this file keeps:
// - a table layout with every style inline (no <style> block, no <link>, no web fonts);
// - no images and nothing loaded from another site, no tracking pixel;
// - light mode only (the color-scheme metas stop clients from inverting the colours oddly);
// - every inserted value is escaped here or by the caller through escapeHtml.
// Pure: no database, no environment, so tests and the development preview call it directly.

export const COLORS = {
  ivory: "#FAF8F5",
  surface: "#FFFFFF",
  border: "#E4DEE8",
  ink: "#17141C",
  body: "#4A4452",
  secondary: "#6B6474",
  plum: "#2A1B3D",
  champagne: "#C8A97E",
} as const;

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Inter, Arial, Helvetica, sans-serif";

/** The card's side padding. 28px keeps 280px of room inside a 360px phone screen. */
const SIDE = 28;

const e = escapeHtml;

// ---- building blocks (each escapes its text) ----

/** A large serif heading. */
export function heading(text: string, size = 28): string {
  return `<h1 style="margin:0 0 12px;font-family:${SERIF};font-weight:normal;font-size:${size}px;line-height:${size + 6}px;color:${COLORS.ink};">${e(text)}</h1>`;
}

/** Small spaced capitals above a heading: "YOU ARE INVITED". */
export function eyebrow(text: string): string {
  return `<p style="margin:0 0 8px;font-family:${SANS};font-size:12px;line-height:16px;font-weight:600;letter-spacing:2px;color:${COLORS.secondary};">${e(text.toUpperCase())}</p>`;
}

type ParagraphOptions = { secondary?: boolean; small?: boolean; center?: boolean };

function paragraphStyle({ secondary, small, center }: ParagraphOptions = {}) {
  const size = small ? 13 : 16;
  const line = small ? 20 : 24;
  const color = secondary ? COLORS.secondary : COLORS.body;
  return `margin:0 0 16px;font-family:${SANS};font-size:${size}px;line-height:${line}px;color:${color};${
    center ? "text-align:center;" : ""
  }`;
}

/** A paragraph of plain text. */
export function paragraph(text: string, options?: ParagraphOptions): string {
  return `<p style="${paragraphStyle(options)}">${e(text)}</p>`;
}

/** A paragraph from HTML the caller has already escaped (for bold names inside a sentence). */
export function paragraphHtml(html: string, options?: ParagraphOptions): string {
  return `<p style="${paragraphStyle(options)}">${html}</p>`;
}

/** A name or phrase in bold, escaped, for use inside paragraphHtml. */
export function strong(text: string): string {
  return `<strong style="font-weight:600;color:${COLORS.ink};">${e(text)}</strong>`;
}

/**
 * The main button. A table cell holds the colour and the rounded corners, and the link inside
 * has the padding, so it still works in Outlook (which shows square corners). 48px tall.
 */
export function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;"><tr><td align="center" bgcolor="${COLORS.plum}" style="background-color:${COLORS.plum};border-radius:24px;"><a href="${e(url)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:16px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:24px;">${e(label)}</a></td></tr></table>`;
}

/** The plain address under a button, for clients that do not show buttons or links well. */
export function linkFallback(url: string): string {
  return `<p style="margin:0 0 24px;font-family:${SANS};font-size:13px;line-height:20px;color:${COLORS.secondary};">Or paste this link into your browser:<br><span style="word-break:break-all;color:${COLORS.secondary};">${e(url)}</span></p>`;
}

/** A bordered box, such as one event. */
export function card(innerHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 12px;background-color:${COLORS.ivory};border:1px solid ${COLORS.border};border-radius:10px;"><tr><td style="padding:16px 18px;font-family:${SANS};font-size:15px;line-height:22px;color:${COLORS.body};">${innerHtml}</td></tr></table>`;
}

// ---- the page around them ----

export type LayoutInput = {
  /** The page title (the subject). */
  title: string;
  /** A short summary some inboxes show beside the subject. Hidden in the message itself. */
  preheader: string;
  /** The content, built from the blocks above. */
  bodyHtml: string;
  /** The small line at the bottom, plain text. */
  footer: string;
};

/** Hidden text some inboxes show after the subject, padded so nothing else leaks into it. */
function preheader(text: string): string {
  const filler = "&zwnj;&nbsp;".repeat(60);
  return `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${COLORS.ivory};">${e(text)}${filler}</div>`;
}

export function renderLayout({ title, preheader: summary, bodyHtml, footer }: LayoutInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<meta name="x-apple-disable-message-reformatting">
<title>${e(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.ivory};">
${preheader(summary)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.ivory}" style="width:100%;background-color:${COLORS.ivory};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:12px;">
<tr><td style="padding:28px ${SIDE}px 0 ${SIDE}px;font-family:${SERIF};font-size:22px;line-height:28px;color:${COLORS.ink};">Make My Marriage</td></tr>
<tr><td style="padding:12px ${SIDE}px 0 ${SIDE}px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${COLORS.champagne};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:28px ${SIDE}px 8px ${SIDE}px;font-family:${SANS};font-size:16px;line-height:24px;color:${COLORS.body};">
${bodyHtml}
</td></tr>
<tr><td style="padding:8px ${SIDE}px 28px ${SIDE}px;font-family:${SANS};font-size:12px;line-height:18px;color:${COLORS.secondary};">${e(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** The plain-text version: the lines as they are, a blank line, then the footer. */
export function renderText(lines: string[], footer: string): string {
  return [...lines, "", footer].join("\n");
}

/** Emails come from an address nobody reads: say so, so nobody waits for an answer. */
export const NO_REPLY = "This is an automatic email, so replies are not read.";

/** "Sent by Make My Marriage for Priya & Ravi": the footer of every wedding email. */
export function weddingFooter(weddingName: string): string {
  return `Sent by Make My Marriage for ${weddingName}. ${NO_REPLY}`;
}

/** The footer of account emails (password reset). */
export const ACCOUNT_FOOTER = `Make My Marriage. ${NO_REPLY}`;
