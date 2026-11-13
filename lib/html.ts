// Helpers for building HTML by hand (emails). Nothing here touches the DOM or the database.

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes text for use in HTML content or in a quoted attribute. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ENTITIES[c]!);
}

/** The address if it is a plain https:// link, otherwise undefined. For href attributes. */
export function safeHref(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** One line of text: line breaks and other control characters become spaces (for subjects). */
export function oneLine(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    // C0 controls, DEL, and the Unicode line and paragraph separators.
    out += code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029 ? " " : ch;
  }
  return out.replace(/ {2,}/g, " ").trim();
}
