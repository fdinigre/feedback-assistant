// The practice prompt for the student's maths gem: what the report asks the AI to
// write, and how it is attached to the student's Toddle comment. No server imports:
// the outputs panels copy the comment with it, and the exports print it.
//
// The students have a Gemini gem set up as a maths study helper. The prompt is
// something they paste into it so the gem drills them on their own next steps —
// built from their actual mistakes on this paper, in their own voice.

/**
 * The heading the prompt sits under, at the end of the Toddle comment. Kept to 60
 * characters so the Toddle export reads it as a section heading, like "Your next steps:".
 */
export const GEM_PROMPT_HEADING = "Practise with your gem — copy everything below into it:";

/** The student's Toddle comment with the gem prompt after it, when there is one. */
export function withGemPrompt(toddleReport: string, gemPrompt: string | undefined): string {
  const report = toddleReport.trim();
  const gem = (gemPrompt ?? "").trim();
  if (!gem) return report;
  if (!report) return `${GEM_PROMPT_HEADING}\n\n${gem}`;
  return `${report}\n\n${GEM_PROMPT_HEADING}\n\n${gem}`;
}

/**
 * The prompt goes to Gemini from the student's own account, so it carries no name
 * at all — not even the token the app would swap a name into.
 */
export function cleanGemPrompt(text: unknown): string {
  return String(text ?? "")
    .replace(/\{\{\s*(FIRST)?NAME\s*\}\}[,:]?\s*/gi, "")
    .trim();
}

/** The writing rule both report prompts carry, for a student described as e.g. "a Grade 9 MYP maths student". */
export function gemPromptRule(studentLabel: string): string {
  return `7. Gem prompt: the student has a Gemini "gem" set up as their maths study helper. Write a prompt the student will
   copy into it, so the gem helps them act on "Your next steps" from the Toddle report. Write it in the STUDENT's own
   voice ("I", "me"), plain language, as ONE string with line breaks, roughly 130-220 words:
   - Start with who they are and what happened: "I'm ${studentLabel}. On my test on <the topic> I ..." Say concretely
     what went wrong, as patterns the gem can recreate, drawn from the grading evidence above — for example "when I
     rearranged 2y = 6x + 4 to make y the subject I divided only the first term". Real mistakes from this paper,
     never invented ones. No question numbers, no scores, marks, levels or grades.
   - Then a numbered list with ONE item per next step, in the same order. For each, say what to practise with: questions
     like the ones this student got wrong (same topic and difficulty, then a little harder), and the habit to build
     into them — for example, on a straight-lines test, "give me rearranging questions like that one, and make me say 'divide every term' each time";
     "give me lines to find the perpendicular gradient of, and make me write the flipped-and-negative gradient on its
     own line first"; "give me a point and an equation, and ask me to put the point in to check both sides match";
     "give me a question and ask me to write the formula I need before I start".
   - Then how to run the session: one question at a time; wait for my answer; check my working step by step and point
     to the first wrong step rather than giving the answer; give a hint if I'm stuck; show a full worked solution only
     after two tries; finish with a short summary of what I should still practise.
   - Never include any name — not the student's, not {{NAME}}, not the teacher's — nor the school or class.
   - Never ask the gem to do the student's homework or assessed work for them.`;
}

/** The field's line in the JSON shape both report prompts ask for. */
export const GEM_PROMPT_JSON_FIELD = `"gemPrompt": "<the prompt in the student's voice, as rule 7 describes>",`;
