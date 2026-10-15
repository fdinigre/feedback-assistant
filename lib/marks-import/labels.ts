// No server imports: the upload panel and the review screen label differences with this.

/** A markscheme part as a teacher writes it in a heading: "a" -> "a", "b.ii" -> "b(ii)". */
export function partDisplay(part: string): string {
  if (!part) return "";
  const m = part.match(/^([a-z]?)[.(\s]*([ivx]+)?\)?$/i);
  if (!m) return part;
  return `${m[1].toLowerCase()}${m[2] ? `(${m[2].toLowerCase()})` : ""}`;
}

/** "Q1", "Q1a", "Q5b(ii)" — what a column on the teacher's sheet would be headed. */
export function sheetQuestionLabel(questionNumber: string, part: string): string {
  return `Q${questionNumber}${partDisplay(part)}`;
}
