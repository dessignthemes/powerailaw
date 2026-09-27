// Initials for a person's avatar circle.
//   "Peter Rapciewicz"            → "PR"
//   peter.r@firm.com (no name)     → "PR"
//   peter.rapciewicz@firm.com      → "PR"
//   mariusz@firm.com               → "M"
export function initialsFor(name: string | null | undefined, email: string | null | undefined): string {
  const letter = (s: string) => s.match(/\p{L}/u)?.[0]?.toUpperCase() ?? "";
  const words = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w));
  if (words.length >= 2) return letter(words[0]) + letter(words[words.length - 1]);
  if (words.length === 1) return letter(words[0]);

  const local = (email ?? "").split("@")[0] ?? "";
  const parts = local.split(/[._\-+]+/).filter((p) => /\p{L}/u.test(p));
  if (parts.length >= 2) return letter(parts[0]) + letter(parts[parts.length - 1]);
  if (parts.length === 1) return letter(parts[0]);
  return "?";
}

export function displayName(name: string | null | undefined, email: string | null | undefined) {
  return (name ?? "").trim() || email || "Unknown";
}
