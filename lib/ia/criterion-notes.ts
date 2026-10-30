// The IB guide's own clarifications for each Exploration criterion (Mathematics:
// applications and interpretation guide, "Internal assessment", pp. 81-89, SL),
// kept as editable notes. They sit beside the teacher's annotated rubric: the
// rubric says what each band looks like, these say how the IB tells examiners
// and teachers to read it. Stored as one JSON object in app_settings; anything
// the teacher has not edited falls back to the default below.
//
// Pure module (no "server-only", no DB): the Settings screen, the prompts and
// the checks all import it.

export const IA_NOTE_KEYS = ["General", "A", "B", "C", "D", "E"] as const;
export type IaNoteKey = (typeof IA_NOTE_KEYS)[number];
export type IaCriterionNotes = Record<IaNoteKey, string>;

export const IA_NOTE_LABELS: Record<IaNoteKey, string> = {
  General: "General (all criteria)",
  A: "A — Presentation",
  B: "B — Mathematical communication",
  C: "C — Personal engagement",
  D: "D — Reflection",
  E: "E — Use of mathematics (SL)",
};

const lines = (...l: string[]) => l.join("\n");

export const IA_NOTE_DEFAULTS: IaCriterionNotes = {
  General: lines(
    "- Length: approximately 12-20 pages, double line spacing, including diagrams and graphs but excluding the bibliography. The quality of the mathematical writing matters, not the length.",
    "- Cover page states the title of the exploration and the number of pages.",
    "- References are not assessed, but if they are missing from the final report it may be flagged as an academic honesty issue.",
    "- Teachers read and advise on ONE draft only. Advice may be oral or written, on how the work could be improved, but the teacher must not edit the draft.",
    "- Teachers indicate that errors exist but must not explicitly correct them.",
    "- The mathematics should be commensurate with the level of the course (similar to the syllabus). Work outside the syllabus is not expected, and is not penalised."
  ),
  A: lines(
    "- Coherent: logically developed, easy to follow and meets its aim. Refers to the overall structure (introduction, body, conclusion) and how well the parts link.",
    "- Well organised: has an introduction, describes the aim, and has a conclusion. Relevant graphs, tables and diagrams sit in the appropriate place in the text, not attached as appendices. Appendices are for large data sets and additional graphs, diagrams and tables.",
    "- Concise: no irrelevant or unnecessarily repetitive calculations, graphs or descriptions.",
    "- Technology is encouraged where appropriate but not required. Using analytic approaches rather than technology does not by itself mean a lack of conciseness and must not be penalised. This does not mean repetitive calculations are condoned."
  ),
  B: lines(
    "- Assesses: appropriate mathematical language (notation, symbols, terminology); key terms and variables defined where required; multiple forms of representation (formulae, diagrams, tables, charts, graphs, models) where appropriate; a deductive method with proofs set out logically where appropriate.",
    "- Calculator or computer notation is acceptable only if it is software generated. Otherwise appropriate mathematical notation is expected.",
    "- Examples of level 1 include unlabelled graphs, and consistent use of computer notation with no other correct mathematical communication.",
    "- Level 4 can be achieved using only ONE form of mathematical representation, as long as it is appropriate to the topic.",
    "- At level 4, minor errors that do not impair clear communication should not be penalised.",
    "- Judge the mathematical language, not the English prose."
  ),
  C: lines(
    "- Assesses how far the student engages with the topic by exploring the mathematics and making it their own. It is NOT a measure of effort.",
    "- May be recognised in: thinking independently or creatively, presenting mathematical ideas in their own way, exploring the topic from different perspectives, making and testing predictions.",
    "- There must be evidence in the student's work. A teacher saying the student was highly engaged is not sufficient.",
    "- Textbook-style explorations, or reproduction of readily available mathematics without the student's own perspective, are unlikely to reach the higher levels.",
    "- Significant (2): authentic personal engagement on a few occasions, evidently driving the exploration forward and helping the reader understand the writer's intentions.",
    "- Outstanding (3): authentic personal engagement in numerous instances of high quality, driving the exploration forward in a creative way, leaving the impression of a complete understanding of the context of the topic."
  ),
  D: lines(
    "- Assesses how the student reviews, analyses and evaluates the exploration. It may appear in the conclusion but may also be found throughout.",
    "- Simply describing results is limited reflection.",
    "- Meaningful reflection can be: linking to the aims of the exploration, commenting on what was learned, considering some limitation, comparing different mathematical approaches.",
    "- Critical reflection is crucial, deciding or deeply insightful. It often develops the exploration by addressing the mathematical results and their impact on the student's understanding. Ways: considering what next, discussing implications of results, discussing strengths and weaknesses of approaches, considering different perspectives.",
    "- Substantial evidence means critical reflection is present throughout. If it appears only at the end, it must be of high quality and show how it developed the exploration to earn level 3."
  ),
  E: lines(
    "- Relevant: mathematics that supports the development of the exploration towards its aim. Overly complicated mathematics where simple mathematics would suffice is not relevant.",
    "- Commensurate with the level of the course: not completely based on prior-learning mathematics; part of the syllabus or at a similar level.",
    "- \"Demonstrated\" means made clear by reasoning or evidence, illustrating with examples or practical application. Obtaining the correct answer is NOT sufficient to demonstrate understanding (even some understanding) at level 2 or higher.",
    "- Thorough knowledge and understanding must be demonstrated throughout.",
    "- The mathematics can be regarded as correct even with occasional minor errors, as long as they do not detract from the flow of the mathematics or lead to an unreasonable outcome.",
    "- Technology is encouraged, but understanding must be demonstrated to achieve higher than level 1. Merely substituting values into a formula does not necessarily demonstrate understanding of the results.",
    "- The mathematics only needs to be what supports the exploration: a few small elements, or even a single topic, can reach a high level. Better to do a few things well than a lot not so well."
  ),
};

/** Parses what is stored in app_settings; unknown keys are ignored, missing or blank ones fall back to the default. */
export function parseIaCriterionNotes(stored: string | null): IaCriterionNotes {
  let saved: Record<string, unknown> = {};
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object") saved = parsed as Record<string, unknown>;
    } catch {
      // fall through to defaults
    }
  }
  const out = {} as IaCriterionNotes;
  for (const k of IA_NOTE_KEYS) {
    const v = saved[k];
    out[k] = typeof v === "string" && v.trim() ? v : IA_NOTE_DEFAULTS[k];
  }
  return out;
}

/** Only the notes that differ from the default are stored, so a future change to a default reaches notes you never touched. */
export function serializeIaCriterionNotes(notes: Partial<IaCriterionNotes>): string {
  const edited: Partial<IaCriterionNotes> = {};
  for (const k of IA_NOTE_KEYS) {
    const v = (notes[k] ?? "").trim();
    if (v && v !== IA_NOTE_DEFAULTS[k].trim()) edited[k] = v;
  }
  return JSON.stringify(edited);
}

export function isEditedNote(key: IaNoteKey, value: string): boolean {
  return value.trim() !== IA_NOTE_DEFAULTS[key].trim();
}

/** The block both IA prompts carry. Empty string when every note is blank. */
export function iaNotesPromptBlock(notes: IaCriterionNotes): string {
  const parts = IA_NOTE_KEYS.map((k) => {
    const body = notes[k].trim();
    return body ? `${IA_NOTE_LABELS[k]}:\n${body}` : "";
  }).filter(Boolean);
  if (parts.length === 0) return "";
  return `\nIB GUIDE NOTES (the IB's own clarifications of how to read each criterion; apply them with the
rubric. Where the teacher's annotated rubric or checklist is more specific, follow that instead):
${parts.join("\n\n")}\n`;
}
