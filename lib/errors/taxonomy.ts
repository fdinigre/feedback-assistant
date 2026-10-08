/**
 * The kinds of mistake this teacher's marking actually keeps describing.
 *
 * Not invented: scripts/error-taxonomy-propose.ts read 311 passages of her own
 * grading evidence across all four classes — Criterion A and C, Criterion B,
 * Financial Math and the Diploma class — and proposed these. The wording is hers
 * in the sense that it came out of her marking, and the counts behind each one
 * were several passages, never a single question.
 *
 * Two things are deliberately NOT here. A blank question and illegible work are
 * both counted by other means and are both so common that they would crowd out
 * everything worth coaching. And a concept slip on a multiple-choice item, where
 * there is no working to inspect, was dropped rather than filed under a label
 * that does not say what went wrong.
 *
 * The ids are stored in the database, so they are stable: rename a `name` freely,
 * never an `id`.
 */

export type ErrorMechanism = {
  id: string;
  name: string;
  /**
   * "maths": the method or the algebra went wrong. "question": the maths may be
   * fine but the answer does not do what the command term asked — justify,
   * verify, show that, find the value. The two need different help at home.
   */
  about: "maths" | "question";
  definition: string;
  /** The nearest thing that is NOT this, which is what keeps the list usable. */
  notThis: string;
};

export const MECHANISMS: ErrorMechanism[] = [
  {
    id: "no-value-reached",
    name: "Wrote the formula down but never got to a number",
    about: "maths",
    definition:
      "The right formula, table or first line is written and then abandoned — no substitution is made, or the working stops mid-way and no value is ever produced.",
    notThis: "Not a wrong value reached by a complete calculation — here nothing numerical comes out at all.",
  },
  {
    id: "no-reason",
    name: "No reason, or a reason that doesn't support the answer",
    about: "question",
    definition:
      "A conclusion, rule or decision is stated with the justification missing, replaced by a restatement of the answer, or backed by a reason that is irrelevant to or contradicts the conclusion.",
    notThis:
      "Not an unfinished calculation — the answer is there, it is the supporting argument that is absent or incoherent.",
  },
  {
    id: "wrong-formula",
    name: "Used the wrong formula for the job",
    about: "maths",
    definition:
      "A standard procedure is applied that cannot answer this question — midpoint where gradient was needed, distance where midpoint was needed, arithmetic rules for a geometric pattern, side lengths or perimeters where areas were needed, multiplying by the surd instead of the conjugate.",
    notThis:
      "Not the correct formula used with the wrong numbers, and not a valid alternative method that does reach the required quantity.",
  },
  {
    id: "wrong-inputs",
    name: "Right formula, wrong numbers in it",
    about: "maths",
    definition:
      "The correct procedure is set up but fed the wrong inputs — a coordinate from the wrong point, x and y swapped, a value misread from the question, a required term omitted, or a quantity added where it should have been subtracted.",
    notThis:
      "Not a slip in evaluating a correctly substituted expression, and not choosing the wrong formula in the first place.",
  },
  {
    id: "arithmetic-slip",
    name: "Slipped on the arithmetic",
    about: "maths",
    definition:
      "The method and the substitution are right but a number is miscomputed or mis-copied — dividing by the wrong figure, forgetting to divide by 2, transposing digits, dropping a square root at the last line.",
    notThis:
      "Not a sign loss and not a bracket expanded wrongly; the structure of the working is sound and only the computation fails.",
  },
  {
    id: "contradicts-own-working",
    name: "Final answer doesn't match your own working",
    about: "maths",
    definition:
      "The last line contradicts a value the student themselves established earlier — a rule quoted back with a different coefficient, a substitution into a gradient they did not find, an intercept inconsistent with their own equation, a figure number that does not follow from their own rule.",
    notThis:
      "Not an error inherited honestly from an earlier wrong value (follow-through) — here the final line disagrees with the student's own numbers.",
  },
  {
    id: "lost-minus-sign",
    name: "Lost a minus sign",
    about: "maths",
    definition:
      "The magnitude is handled correctly but a negative disappears, flips, or is never applied — a gradient quoted without its sign, a negative reciprocal that is only reciprocated or only negated, a subtraction of a negative treated as a subtraction.",
    notThis:
      "Not a wrong value arising from the wrong points or the wrong formula — strip the sign and the answer would be right.",
  },
  {
    id: "checked-against-itself",
    name: "Checked it against itself",
    about: "question",
    definition:
      "The verification asked for is done by re-substituting the same given figures, repeating one calculation, or extending the table — never by an independent test such as dividing consecutive terms more than once or drawing and counting the predicted figure.",
    notThis:
      "Not an absent conclusion or absent reason; a check is attempted here, it just cannot confirm anything the student has not already assumed.",
  },
  {
    id: "answered-different-question",
    name: "Answered a slightly different question",
    about: "question",
    definition:
      "A sound method is carried out, but aimed at the wrong target — setting two rules equal instead of subtracting them, finding a total instead of a difference, a difference of zero instead of 75, evaluating f(0) instead of solving f(x)=0.",
    notThis:
      "Not reaching for a formula that belongs to another topic — here the technique is appropriate, only the quantity being solved for is not the one asked for.",
  },
  {
    id: "words-not-value",
    name: "Described it in words instead of giving the value",
    about: "question",
    definition:
      "The quantity is characterised qualitatively — 'positive slope', 'k is a fraction', 'fuel use goes up' — or only one of the two values the question demands is named, so the required number is never stated.",
    notThis:
      "Not a numerically wrong answer, and not a blank; the student clearly understands something but never commits to the figure asked for.",
  },
  {
    id: "worked-backwards",
    name: "Worked backwards from the answer you were given",
    about: "question",
    definition:
      "In a 'show that' or 'verify' question the student starts from the printed answer and manipulates or re-copies it, so the result is assumed rather than derived.",
    notThis:
      "Not simply writing the target at the top as a heading and then deriving it properly underneath, and not a correct derivation that happens to finish at the printed value.",
  },
  {
    id: "expanded-term-by-term",
    name: "Squared or expanded a bracket term by term",
    about: "maths",
    definition:
      "A squared or multiplied bracket is broken up as if the terms inside were separate, so (-1-c)^2 becomes 1 - c^2, (6√2)^2 becomes 12, or 2(x-1) becomes 2x+1.",
    notThis:
      "Not an arithmetic mistake inside a correctly expanded expression, and not a sign error on a single term.",
  },
  {
    id: "one-root-only",
    name: "Only took one square root, and ignored the condition you were given",
    about: "maths",
    definition:
      "A square root or quadratic is solved and a single value is reported, with no ± and no use of the restriction stated in the question to choose or reject a root.",
    notThis:
      "Not failing to justify a conclusion in words — here a numerical case is genuinely missing from the solution.",
  },
];

export const MECHANISM_BY_ID = new Map(MECHANISMS.map((m) => [m.id, m]));

export function isMechanismId(value: unknown): value is string {
  return typeof value === "string" && MECHANISM_BY_ID.has(value);
}

/** The closed list as the classifier sees it. */
export function mechanismPromptBlock(): string {
  return MECHANISMS.map(
    (m) => `  ${m.id}\n    ${m.name}\n    ${m.definition}\n    NOT THIS: ${m.notThis}`
  ).join("\n\n");
}
