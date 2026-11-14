// Words that start a title, not a first name: "Dr. Rao" is greeted as "Dr. Rao", not "Dr.".
const TITLES = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "mx",
  "dr",
  "prof",
  "sri",
  "shri",
  "smt",
  "kum",
  "sir",
  "dame",
  "capt",
  "col",
  "maj",
  "lt",
  "gen",
  "rev",
  "fr",
  "hon",
  "adv",
  "justice",
]);

/**
 * The name to greet a guest with ("Dear Meena", "Thank you, Meena"): the first word of a person's
 * name, but the whole name when the first word is a title ("Dr. Rao"), or the guest is a couple or
 * a family ("Mr. & Mrs. Iyer", "The Sharma Family", "Anil and Sunita"), where one word would be
 * wrong. Falls back to the text itself. Browser-safe: no imports.
 */
export function firstName(name: string): string {
  const full = name.trim().replace(/\s+/g, " ");
  if (!full) return name.trim();
  const first = full.split(" ")[0]!;
  const lead = first.replace(/\.$/, "").toLowerCase();
  const group = /&|\+|\band\b|\bfamily\b/i.test(full) || lead === "the";
  return TITLES.has(lead) || group ? full : first;
}
