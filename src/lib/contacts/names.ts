// Name matching shared by the server (Details ↔ Contacts) and the Details panel.
// ── Name matching ────────────────────────────────────────────────────────────
// "Law Offices of Edward V. Murachanian, LLC" ≈ "law office of edward murachanian"
export function normCompany(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\boffices\b/g, "office")
    .replace(/\b(the|llc|l l c|inc|incorporated|corp|corporation|co|company|pc|p c|pa|p a|llp|ltd|esq|esquire)\b/g, " ")
    .replace(/\b[a-z]\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
// "Colleen Flynn Cyphers, Esq." ≈ "colleen flynn cyphers"; "Smith, John" ≈ "john smith"
export function normPerson(s: string) {
  let t = s.replace(/,?\s*(esq\.?|esquire|jr\.?|sr\.?|iii|ii)\s*$/i, "").trim();
  const parts = t.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length === 2 && !/\s/.test(parts[0])) t = `${parts[1]} ${parts[0]}`; // "Last, First"
  return t
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(mr|mrs|ms|miss|dr|esq)\b/g, " ")
    .replace(/\b[a-z]\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
