import type { TaskDocumentKind } from "@/lib/types";

// No server imports: the setup page's kind picker uses these labels too.

/** In the order the setup page offers them, and the grader reads them. */
export const TASK_DOCUMENT_KINDS: TaskDocumentKind[] = [
  "task",
  "template",
  "rubric",
  "exemplar",
  "solution",
  "other",
];

export const TASK_DOCUMENT_LABELS: Record<TaskDocumentKind, string> = {
  task: "Task sheet",
  template: "Template given to students",
  rubric: "Rubric / checklist",
  exemplar: "Exemplar",
  solution: "Worked solution / key",
  other: "Other guidance",
};

/**
 * How much of one document the grader is given. An exemplar report runs to about
 * 15,000 characters; a document far past this is usually a whole unit pasted in,
 * and the setup page says so beside it rather than letting it crowd out the work.
 */
export const MAX_DOC_CHARS_FOR_GRADING = 20000;

/** Kinds that show what good work looks like, so stand in for a worked solution. */
export const REFERENCE_KINDS: TaskDocumentKind[] = ["exemplar", "solution"];

/** Kinds that can print an achievement-level table worth reading descriptors from. */
export const RUBRIC_SOURCE_KINDS: TaskDocumentKind[] = ["task", "rubric", "other"];

/**
 * A first guess from the file name, so a whole folder can go up in one go. The
 * teacher corrects any wrong one in the list afterwards — a guess is all this is.
 *
 * Order matters: "example solution" is a solution and "Example report template"
 * a template, so both are tried before "example" means an exemplar. A file that
 * matches nothing is the task sheet if there is none yet, and guidance after that.
 */
export function guessTaskDocumentKind(fileName: string, hasTaskSheet: boolean): TaskDocumentKind {
  const name = fileName.toLowerCase().replace(/\.[a-z0-9]+$/, "");
  if (/\b(solutions?|key|mark ?schemes?|answers?)\b/.test(name)) return "solution";
  if (/\btemplate\b/.test(name)) return "template";
  if (/\b(checklist|rubric)\b/.test(name)) return "rubric";
  if (/\b(exemplar|examples?|model answer|sample)\b/.test(name)) return "exemplar";
  if (/\b(guidance|guide|instructions|how to|help)\b/.test(name)) return "other";
  return hasTaskSheet ? "other" : "task";
}
