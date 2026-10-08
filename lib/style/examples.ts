// The report structure every full report follows, seeded into style_examples on
// first db init (see lib/db/index.ts).
//
// Comment examples are NOT seeded. They are the teacher's own voice, and a copy
// handed to a colleague must neither write in someone else's voice nor carry
// someone else's students' names; each teacher adds their own in Settings.

/** What the prompt says in place of examples until the teacher has added some. */
export const NO_COMMENT_EXAMPLES = `(No examples of this teacher's comments on file yet. Write as an experienced, warm but direct
maths teacher: specific about evidence, honest about what limited the score, and concrete about the next step.)`;

/** Describes the five sections every full report must contain, in order. */
export const REPORT_STRUCTURE = `Full report structure (reference: "Trig test analysis"):

1. Data Correlation (Internal Insight) — test performance cross-referenced with MAP percentile/deltas and CAT4 SAS. Omitted (with a note, never invented) when the student has no external data on file.
2. Strengths — bullets, each citing specific question numbers and topics.
3. Areas for Improvement — bullets naming the specific error pattern with question evidence.
4. Actionable Steps — concrete, named techniques and drills.
5. Feedback Comment — the Toddle paragraph: addresses the student by name using "you"; roughly 70-90 words; structure = specific strength with evidence -> the specific errors that limited the score -> an actionable next step tied to level-band language (e.g. "to move into the Level 7-8 bracket..."); encouraging without inflating.`;
