// Splits the teacher's annotated Exploration rubric (specs/reference/
// exploration-rubric-sl-v1.4.txt) into checklist items: each bullet under each
// band becomes one item with a stable id — criterion letter, band level, and its
// position in that band ("A2.3"). Lines under a band that are not bullets are kept
// as the band's notes. Pure: the page reads the file and hands the text in.

export type RubricItem = { id: string; text: string };
export type RubricBand = { level: number; descriptor: string; notes: string[]; items: RubricItem[] };
export type RubricCriterion = { criterion: "A" | "B" | "C" | "D" | "E"; title: string; bands: RubricBand[] };

const CRITERION_RE = /^([A-E]):\s*(.+?)\s*$/;
const BAND_RE = /^(\d)\s*[:.]\s*(.*)$/;
const BULLET_RE = /^[\s]*[•\-•]\s*(.*)$/;

export function parseRubricItems(text: string): RubricCriterion[] {
  const out: RubricCriterion[] = [];
  let crit: RubricCriterion | null = null;
  let band: RubricBand | null = null;

  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const bare = line.trim();
    if (!bare) continue;

    const c = !/^\s/.test(line) ? CRITERION_RE.exec(bare) : null;
    if (c) {
      crit = { criterion: c[1] as RubricCriterion["criterion"], title: c[2].replace(/\s+/g, " "), bands: [] };
      out.push(crit);
      band = null;
      continue;
    }
    if (!crit) continue;
    if (/^\/\d+$/.test(bare)) continue; // the "/4" max line under a criterion title

    const b = !/^\s/.test(line) ? BAND_RE.exec(bare) : null;
    if (b) {
      band = { level: Number(b[1]), descriptor: b[2].replace(/\s+/g, " ").trim(), notes: [], items: [] };
      crit.bands.push(band);
      continue;
    }
    if (!band) continue;

    const bullet = BULLET_RE.exec(line);
    if (bullet && line.includes("•")) {
      const t = bullet[1].replace(/\s+/g, " ").trim();
      if (!t) continue;
      const prev = band.items[band.items.length - 1];
      // A bullet that only continues the previous one's sentence (Word wrapped it onto a new bullet).
      if (prev && /^[a-z]/.test(t) && !/[.!?:)]$/.test(prev.text)) {
        prev.text = `${prev.text} ${t}`;
        continue;
      }
      band.items.push({ id: `${crit.criterion}${band.level}.${band.items.length + 1}`, text: t });
    } else if (band.items.length === 0 && !band.notes.length && /^[a-z]/i.test(bare) && band.descriptor && !/[.!?]$/.test(band.descriptor)) {
      // The descriptor ran onto a second line.
      band.descriptor = `${band.descriptor} ${bare.replace(/\s+/g, " ")}`;
    } else {
      band.notes.push(bare.replace(/\s+/g, " "));
    }
  }
  return out;
}

export function allRubricItems(rubric: RubricCriterion[]): Map<string, RubricItem & { criterion: string; level: number }> {
  const m = new Map<string, RubricItem & { criterion: string; level: number }>();
  for (const c of rubric) for (const b of c.bands) for (const i of b.items) m.set(i.id, { ...i, criterion: c.criterion, level: b.level });
  return m;
}

/** The checklist as the prompt lists it: one line per item, grouped by criterion and band. */
export function rubricItemsPromptBlock(rubric: RubricCriterion[]): string {
  return rubric
    .map(
      (c) =>
        `${c.criterion} (${c.title}):\n` +
        c.bands
          .filter((b) => b.items.length > 0)
          .map((b) => `  Level ${b.level}:\n` + b.items.map((i) => `    [${i.id}] ${i.text}`).join("\n"))
          .join("\n")
    )
    .join("\n");
}
