// How a report's next steps are written, MYP and DP alike. No server imports: both
// report prompts and the gem prompt use it.
//
// The teacher's rule: a next step is for the student's NEXT assessments, not a
// post-mortem of this one. It is a skill that carries over — algebra, test-taking
// habits, the maths concept behind a mistake — with this paper's mistakes as the
// evidence for which one. A step that only matters for one kind of task says so.
// Always in student language: no invented technique names, no slogans for the
// student to say out loud, no term left unexplained.

/** What a step that only applies to one kind of task starts with, by programme. */
const SCOPE_EXAMPLES: Record<"MYP" | "DP", string> = {
  MYP: `"In investigation tasks (Criterion B): …", "In real-life problem tasks (Criterion D): …"`,
  DP: `"On calculator papers: …", "In questions that ask you to show that something is true: …"`,
};

/** The Actionable Steps rule, for the report prompt of an MYP or a DP assessment. */
export function nextStepsRule(programme: "MYP" | "DP"): string {
  return `Actionable Steps — what the student should do for their NEXT assessments, not a review of this one:
   - Each step is a skill that carries over to any upcoming test or task. Use this paper's mistakes as the evidence
     for WHICH skill to work on, but write the step so it applies to any test, not to this task's questions.
     Choose from: algebra and number skills (rearranging an equation, expanding brackets, working with fractions,
     negative numbers and powers, simplifying); test-taking habits (reading the whole question and marking what it
     asks for, showing every step of working, checking an answer by putting it back into the question, rounding
     only at the end and giving units, going back to questions you skipped, attempting every part); and the maths
     concepts behind the mistakes (for example what a common ratio is and how to find one).
   - A step that only matters for one kind of task says so at its start, e.g. ${SCOPE_EXAMPLES[programme]}.
     A step about a command term says which kind of task it belongs to and explains in plain words what the term
     asks for.
   - Student language: short, plain words a student uses. No rubric or descriptor wording.
   - NEVER invent a name for a technique, drill, template or method (no "the Three-Step Check", no "the Unit-vs-Total
     Audit"), and NEVER give the student a phrase or slogan to say or repeat. Say the actual thing to do instead —
     e.g. "under a sigma sign, write where the count starts, where it stops and the rule for each term before you
     work anything out", not "use the Three-Anchor Sigma Drill".
   - A maths word the student may not know (e.g. "common ratio", "converge") is explained in a few words the first
     time it is used.
   No question numbers.`;
}
