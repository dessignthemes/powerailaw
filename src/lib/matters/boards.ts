// Which Task Board a matter's tasks go on: the board named after the matter's
// abbreviation (REP, RES …), else one named after its type (e.g. "Estate
// Planning"), else the main Task Board.
export function boardForMatter(
  boards: { id: string; name: string }[],
  matter: { matterCode?: string | null; category?: string | null }
): string | null {
  const norm = (s: string) => s.trim().toLowerCase();
  const code = matter.matterCode ? norm(matter.matterCode) : null;
  const cat = matter.category ? norm(matter.category) : null;
  return (code && boards.find((b) => norm(b.name) === code)?.id) || (cat && boards.find((b) => norm(b.name) === cat)?.id) || null;
}
