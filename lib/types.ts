// Shared types for the MYP Math Feedback Assistant.
// Feature agents should code against these shapes rather than re-deriving them.

// ---------------------------------------------------------------------------
// JSON-encoded value shapes (stored as TEXT columns, parsed/stringified at
// the query-helper boundary in lib/db/queries.ts)
// ---------------------------------------------------------------------------

export type TranscriptStep = {
  text: string;
  confident: boolean;
  /**
   * The teacher has said this line is not part of the answer — scratch working,
   * a false start, something from another question. The text is kept so the
   * record of what was on the page survives, but grading never sees it.
   *
   * This is deliberately NOT the same as an unreadable segment: "I cannot read
   * this" and "this is not part of the answer" were sharing one action, which
   * made both signals meaningless.
   */
  omitted?: boolean;
};

export type IllegibleFlag = {
  stepIndex: number;
  note: string;
  resolvedText?: string;
};

export type TranscriptQuestion = {
  questionNumber: string;
  steps: TranscriptStep[];
  illegible: IllegibleFlag[];
  blank: boolean;
};

export type GradingQuestion = {
  questionNumber: string;
  proposedPoints: number;
  conservativePoints: number;
  finalPoints: number | null;
  evidence: string;
  followThrough: boolean;
  conservativeArgument: string | null;
};

export type ReportSections = {
  dataCorrelation: string | null;
  strengths: string[];
  areasForImprovement: string[];
  actionableSteps: string[];
  feedbackComment: string;
  /**
   * A longer, student-facing Toddle comment: a short intro plus easy-language
   * bullet summaries of strengths, things to work on, and next steps. Optional
   * for backward compatibility with reports generated before this field existed.
   */
  toddleReport?: string;
  /**
   * A prompt the student pastes into their maths Gemini gem, in their own voice, so it
   * drills them on their next steps with questions like the ones they got wrong. Shown
   * and copied at the end of the Toddle report (lib/report/gem-prompt.ts). Optional:
   * reports written before it existed have none.
   */
  gemPrompt?: string;
  /**
   * The one ATL skill this piece of work gave evidence for, against the school's
   * Self-Direction rubric. The feedback comment speaks to it in plain language
   * without naming it; this field is what makes it reportable afterwards.
   * Optional: reports written before ATL tracking existed do not have it.
   */
  atlFocus?: {
    cluster: string;
    level: string;
    /** What in this paper shows it — the teacher's audit trail, not the student's. */
    evidence: string;
  } | null;
};

export type NameMask = { page: number; x: number; y: number; w: number; h: number };

/** Per-row save feedback for the submission review page's "Save" buttons. */
export type SaveStatus = { kind: "success" } | { kind: "error"; message: string };

// ---------------------------------------------------------------------------
// Row types — mirror lib/db/schema.sql exactly. TEXT/JSON columns are typed
// as their parsed shape (queries.ts is responsible for JSON.parse/stringify).
// ---------------------------------------------------------------------------

// 11/12 are DP grades (Year 1 = 11, Year 2 = 12); 9/10 remain MYP.
export type Grade = 9 | 10 | 11 | 12;

export type Programme = "MYP" | "DP";

/** The course, in the teacher's own words: "AA HL", "Extended", "Financial Math". */
export type Course = string;

export type ClassRow = {
  id: number;
  name: string;
  grade: Grade;
  programme: Programme;
  dp_year: 1 | 2 | null; // NULL for MYP
  course: Course | null;
  created_at: string;
};

export type StudentRow = {
  id: number;
  class_id: number;
  name: string;
  pseudonym: string;
  /** Sits the modified variant of assessments that have one. */
  modified: boolean;
  created_at: string;
};

export type ExternalDataSource = "MAP" | "CAT4" | "PRIOR_GRADES" | "ATL";

export type ExternalDataRow = {
  id: number;
  student_id: number;
  source: ExternalDataSource;
  /** Which record this is within its source, e.g. "2025-26 S1"; NULL when a source holds one. */
  period: string | null;
  data: unknown; // parsed JSON — shape depends on source
  imported_at: string;
};

export type LearningTargetRow = {
  id: number;
  grade: Grade;
  name: string;
  created_at: string;
};

export type Criterion = "A" | "B" | "C" | "D";

export type AssessmentStatus =
  | "setup"
  | "intake"
  | "transcribing"
  | "grading"
  | "review"
  | "done";

export type DpAssessmentType = "quiz" | "unit_test";

/**
 * Financial Math assessment types. A formative test is scored as points out of
 * a total with per-question feedback and no criterion level.
 */
export type FmAssessmentType = "fm_test";
export type AssessmentType = DpAssessmentType | FmAssessmentType;

/** Which students a question applies to; null = everyone. */
export type QuestionVariant = "standard" | "modified";

/** % -> grade 1..7. minPct is the inclusive floor of the band. */
export type GradeBoundary = { grade: number; minPct: number };

export type AssessmentRow = {
  id: number;
  title: string;
  /**
   * The class sitting this assessment. NULL on rows created before assessments
   * were class-scoped (and on any row whose class could not be inferred), which
   * callers treat as the old grade-wide behaviour.
   */
  class_id: number | null;
  grade: Grade;
  criteria: Criterion[]; // parsed JSON array; [] for DP
  date: string | null;
  name_masks: NameMask[]; // parsed JSON array (page 1 + optional later pages)
  name_mask: NameMask | null; // convenience: the page-1 mask (or first), derived from name_masks
  status: string;
  programme: Programme;
  assessment_type: AssessmentType | null; // NULL for MYP paper tests
  boundaries: GradeBoundary[] | null; // parsed JSON, NULL for MYP
  paper_file: string | null;
  markscheme_file: string | null;
  cover_targets: string[] | null; // parsed JSON
  /** The teacher has said these papers carry no student names: no mask is required. */
  no_name_mask: boolean;
  /** The teacher's own instructions for this assessment's reports; null = none. */
  report_instructions: string | null;
  /** 'add': after the standard rules. 'replace': instead of them. */
  report_instructions_mode: "add" | "replace";
  created_at: string;
};

export type LevelBand = "1-2" | "3-4" | "5-6" | "7-8";

// ---------------------------------------------------------------------------
// IBDP markscheme shapes (parsed from the official markscheme, JSON columns)
// ---------------------------------------------------------------------------

export interface DpSchemeMark {
  id: string; // stable, e.g. 'a-1'
  code: string; // 'M1' | '(M1)' | 'A1' | 'A2' | 'R1' | 'A1ft' ...
  implied: boolean; // was in parentheses
  ft: boolean;
  value: number; // marks this is worth (A2 = 2)
  descriptor: string; // what the mark is awarded for
  alt?: string; // group id for METHOD 2 / OR (mutually exclusive branches)
}

export interface DpSubpart {
  label: string; // 'a', 'b.i', '' if no sub-parts
  maxMarks: number; // from [N marks]
  scheme: string; // verbatim markscheme text for the part (answers, METHOD/EITHER..OR)
  marks: DpSchemeMark[];
  notes: string[]; // Note boxes (binding)
}

export interface DpQuestionScheme {
  subparts: DpSubpart[];
  totalMarks: number;
}

export interface DpMarkAward {
  markId: string;
  code: string;
  awarded: boolean;
  conservativeAwarded: boolean;
  finalAwarded?: boolean; // teacher override from review
  evidence: string;
  note?: string;
}

export interface DpGradingSubpart {
  label: string;
  awards: DpMarkAward[];
  flags: string[];
  /**
   * The teacher's total for this part, taken from their marks sheet. It stands in
   * for the awards in every final total, which stay on record for reference;
   * toggling an award clears it, so the part goes back to being itemised.
   */
  teacherPoints?: number;
}

export interface DpGradingQuestion {
  subparts: DpGradingSubpart[];
  totalAwarded: number;
  /** The teacher's total for the whole question, from their marks sheet — as above. */
  teacherPoints?: number;
}

export type QuestionRow = {
  id: number;
  assessment_id: number;
  number: string;
  max_points: number;
  level_band: LevelBand | null; // NULL for DP
  learning_target_id: number | null;
  dp_scheme: DpQuestionScheme | null; // parsed JSON, NULL for MYP
  variant: QuestionVariant | null;
  created_at: string;
};

export type LevelThresholdRow = {
  id: number;
  assessment_id: number;
  level: number; // 1..8
  min_points: number;
  created_at: string;
};

export type WorkedSolutionRow = {
  id: number;
  assessment_id: number;
  question_id: number | null; // null = whole-assessment notes
  content: string;
  created_at: string;
};

export type RubricRow = {
  id: number;
  assessment_id: number;
  criterion: string; // 'B' | 'C' | 'D'
  content: string;
  created_at: string;
};

/**
 * What a task document is to the grader. The kind decides how it is read: a
 * template's headings are not the student's writing, an exemplar shows a
 * standard rather than the one route to it, and so on (see task-documents.ts).
 */
export type TaskDocumentKind = "task" | "template" | "rubric" | "exemplar" | "solution" | "other";

export type TaskDocumentRow = {
  id: number;
  assessment_id: number;
  kind: TaskDocumentKind;
  original_name: string;
  file_path: string | null;
  text: string;
  used_vision: boolean;
  created_at: string;
};

/** One requirement of one band of a criterion's rubric, as printed on the task. */
export type RubricDescriptorRow = {
  id: number;
  assessment_id: number;
  criterion: string; // 'B' | 'C' | 'D'
  band: LevelBand;
  strand: string | null;
  position: number;
  text: string;
  student_text: string | null;
  created_at: string;
};

/**
 * Whether one student met one descriptor. met_proposed is NULL when the AI did
 * not judge it — not the same as "not met". met_final is the teacher's override.
 */
export type DescriptorCheckRow = {
  id: number;
  submission_id: number;
  descriptor_id: number;
  met_proposed: number | null;
  met_final: number | null;
  evidence: string;
  text_at_check: string;
  created_at: string;
};

/** The upload receipt for a class's year plan. */
export type ClassPlanRow = {
  class_id: number;
  file_name: string;
  start_year: number;
  uploaded_at: string;
};

/** One row of a class's daily plan. */
export type ClassPlanEntryRow = {
  id: number;
  class_id: number;
  date: string;
  end_date: string | null;
  kind: "lesson" | "break";
  lesson_no: string | null;
  unit: string | null;
  topic: string;
  resources: string | null;
  note: string | null;
  criteria: Criterion[]; // parsed JSON
  created_at: string;
};

export type SubmissionStatus =
  | "uploaded"
  | "assigned"
  | "transcribed"
  | "graded"
  | "reviewed"
  | "absent";

export type SubmissionRow = {
  id: number;
  assessment_id: number;
  student_id: number | null;
  pdf_path: string | null;
  page_count: number | null;
  scratch_pages: number[] | null; // parsed JSON
  status: SubmissionStatus;
  warnings: string[] | null; // parsed JSON
  created_at: string;
};

export type TranscriptRow = {
  id: number;
  submission_id: number;
  question_id: number;
  content: TranscriptQuestion; // parsed JSON
  created_at: string;
};

export type SheetMarkRow = {
  id: number;
  submission_id: number;
  question_id: number;
  /** The markscheme part a DP sheet marked ("a", "b.ii"); '' for the whole question. */
  part: string;
  points: number;
  from_blank: boolean;
  /** The app's mark when the sheet was uploaded; null on rows from before this was recorded. */
  app_points: number | null;
  /** The teacher's choice: their mark, the app's, or null while still waiting. */
  resolution: "mine" | "app" | null;
  created_at: string;
};

/** What an upload found, beyond the differences themselves. */
export type MarksUploadSummary = {
  /** The workbook sheet the marks were read from (absent on sheets uploaded before it was recorded). */
  sheetName?: string;
  /** The workbook's other sheets with question columns, which the teacher can read instead. */
  otherSheets?: string[];
  unchanged: number;
  unmatchedNames: string[];
  unmatchedLabels: string[];
  missingFromSheet: string[];
  withoutSubmission: string[];
  /** "Student Q4 (5/3)" — marks above the question maximum, which are not kept. */
  overMax: string[];
  /** Sheet marks for questions the app hasn't marked yet, which are not kept. */
  unmarked: number;
  /** Headed columns that were not read as questions (subtotals, or headings the app can't parse). */
  ignoredColumns?: string[];
  /** Question columns read as subtotals, because the sheet also marks that question's parts. */
  subtotalColumns?: string[];
  /**
   * Whole-question columns ("Q11") for a question the app marks in parts (11a, 11b),
   * compared with the parts' total.
   */
  combinedColumns?: { label: string; parts: string[] }[];
  /** Papers where such a column and the parts' total differ, as found at upload. */
  combinedDifferences?: CombinedDifference[];
};

/**
 * A sheet column for a whole question that disagrees with the total of the parts
 * the app marks it in. It cannot be applied — the sheet does not say which part
 * the difference is in — so the teacher fixes the parts on the review page, and the
 * paper is not settled by the sheet while the totals differ.
 */
export type CombinedDifference = {
  submissionId: number;
  studentName: string;
  label: string;
  questionIds: number[];
  parts: string[];
  incoming: number;
  /** The app's total of the parts. */
  current: number;
};

export type MarksSheetRow = {
  id: number;
  assessment_id: number;
  file_name: string;
  summary: MarksUploadSummary; // parsed JSON
  uploaded_at: string;
};

/**
 * A mark on the teacher's uploaded sheet that differed from the app's.
 *
 * - waiting: still differs and the teacher hasn't chosen — flagged on the review page
 * - mine:    the app now has the teacher's mark
 * - app:     the teacher checked it and kept the app's mark
 * - edited:  the teacher's mark was taken, then changed by hand on the review page
 */
export type SheetDifferenceStatus = "waiting" | "mine" | "app" | "edited";

export type SheetDifference = {
  status: SheetDifferenceStatus;
  /** The app's mark when the sheet was uploaded (null on older rows). */
  appAtUpload: number | null;
  submissionId: number;
  studentName: string;
  questionId: number;
  questionNumber: string;
  /** The DP markscheme part the sheet marked ("a", "b.ii"); '' for the whole question. */
  part: string;
  maxPoints: number;
  /** What the app has now (teacher override if set, else the AI's mark); null when unmarked. */
  current: number | null;
  /** What the teacher's sheet says. */
  sheet: number;
  fromBlank: boolean;
};

export type GradingRow = {
  id: number;
  submission_id: number;
  question_id: number;
  content: GradingQuestion; // parsed JSON
  created_at: string;
};

export type CriterionLevelRow = {
  id: number;
  submission_id: number;
  criterion: string;
  level_proposed: number;
  level_conservative: number;
  level_final: number | null;
  evidence: string;
  created_at: string;
};

export type ReportStatus = "draft" | "approved";

export type ReportRow = {
  id: number;
  submission_id: number;
  sections: ReportSections; // parsed JSON
  status: ReportStatus;
  created_at: string;
};

export type StyleExampleKind = "comment" | "report";

export type StyleExampleRow = {
  id: number;
  kind: StyleExampleKind;
  content: string;
  created_at: string;
};

export type AiRequestRow = {
  id: number;
  purpose: string;
  prompt_file: string;
  response_file: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// IBDP: per-submission grade result
// ---------------------------------------------------------------------------

export type DpResultRow = {
  id: number;
  submission_id: number;
  total_marks: number;
  max_marks: number;
  pct: number;
  grade: number;
  grade_final: number | null; // teacher override from review
  created_at: string;
};

// ---------------------------------------------------------------------------
// IA (Mathematical Exploration)
// ---------------------------------------------------------------------------

export type IaMilestone =
  | "topic_proposed"
  | "topic_approved"
  | "draft_submitted"
  | "feedback_given"
  | "final_submitted"
  | "marked";

export const IA_MILESTONES: IaMilestone[] = [
  "topic_proposed",
  "topic_approved",
  "draft_submitted",
  "feedback_given",
  "final_submitted",
  "marked",
];

export const IA_CRITERIA = [
  { key: "A", name: "Presentation", max: 4 },
  { key: "B", name: "Mathematical Communication", max: 4 },
  { key: "C", name: "Personal Engagement", max: 3 },
  { key: "D", name: "Reflection", max: 3 },
  { key: "E", name: "Use of Mathematics", max: 6 },
] as const;

export type IaCriterionKey = "A" | "B" | "C" | "D" | "E";
export interface IaEvidence {
  quote: string;
  location: string;
}

export interface IaCriterionMark {
  criterion: IaCriterionKey;
  proposed: number;
  final?: number;
  evidence: IaEvidence[];
  justification: string;
}

/**
 * Teacher-facing authenticity signal on the FINAL submission. This is NEVER an
 * accusation and never a plagiarism/AI verdict — it only points at internal
 * inconsistencies (voice, register, sophistication) worth a second look before
 * the teacher signs the IB authenticity confirmation.
 */
export interface IaAuthenticity {
  level: "ok" | "look"; // 'look' = one or more sections worth checking
  notes: string[]; // what to look at and why, pseudonymized
}

export interface IaFinalMarks {
  criteria: IaCriterionMark[];
  total: number;
  toddleComment?: string; // short, student-facing comment ready for Toddle
  authenticity?: IaAuthenticity;
}

/** Whether a rubric checklist statement is true of the draft (negative statements included). */
export type IaChecklistStatus = "evident" | "partly" | "not_evident";

/** One rubric checklist item (see lib/ia/rubric-items.ts) as judged on a draft. */
export interface IaChecklistMark {
  id: string; // e.g. "A2.3" — criterion, band, position in that band
  status?: IaChecklistStatus; // the AI's judgement; absent = not evident
  quote?: string; // verbatim from the draft, when there is something to quote
  location?: string;
  teacherStatus?: IaChecklistStatus; // the teacher's override
  comment?: string; // the teacher's comment on this item
}

export interface IaDraftCriterionFeedback {
  criterion: IaCriterionKey;
  level: number; // 0..max — the level currently evidenced in the draft
  evidence: IaEvidence[]; // quotes from the draft supporting that level
  strengths: string[];
  gaps: string[]; // what is missing to reach the next band up
  suggestions: string[]; // concrete fixes to get there
  checklist?: IaChecklistMark[]; // only items the AI or the teacher touched
  teacherComment?: string; // the teacher's own comment on this criterion
}

/** One problem the math check found in the draft. */
export interface IaMathFinding {
  quote: string; // verbatim from the draft, where the problem is
  location: string; // page or section
  kind: "calculation" | "method" | "notation" | "reasoning" | "accuracy" | "other";
  severity: "major" | "minor";
  teacherNote: string; // what is wrong and what the correct result is — for the teacher only
  studentNote: string; // points at the problem WITHOUT correcting it — may reach the student
  dismissed?: boolean; // the teacher judged it not a problem; left out of the student copy
}

export interface IaMathCheck {
  findings: IaMathFinding[];
  checkedSummary: string; // what was checked and found correct, for the teacher
  uncheckable: string[]; // what could not be verified and why (e.g. raw data not given)
  usedPageImages: boolean; // false when only the text could be checked (Word file, scanned or too long)
}

export interface IaDraftFeedback {
  criteria: IaDraftCriterionFeedback[];
  summary: string;
  toddleComment?: string; // short, student-facing comment ready for Toddle
  mathCheck?: IaMathCheck;
  mathCheckError?: string; // the math check failed; the rest of the feedback still stands
}

export type IaDeadlineRow = {
  id: number;
  class_id: number;
  milestone: IaMilestone;
  due_date: string;
};

export type IaExplorationRow = {
  id: number;
  student_id: number;
  topic: string | null;
  created_at: string;
};

export type IaProgressRow = {
  id: number;
  exploration_id: number;
  milestone: IaMilestone;
  completed_at: string;
};

export type IaDocumentKind = "draft" | "final";

export type IaDocumentRow = {
  id: number;
  exploration_id: number;
  kind: IaDocumentKind;
  file_path: string | null;
  text: string | null; // pseudonymized extracted text
  original_name: string | null;
  uploaded_at: string;
};

export type IaOutputKind = "draft_feedback" | "final_marks";
export type IaOutputStatus = "draft" | "approved";

export type IaOutputRow = {
  id: number;
  exploration_id: number;
  kind: IaOutputKind;
  content: IaDraftFeedback | IaFinalMarks; // parsed JSON
  status: IaOutputStatus;
  created_at: string;
};

export type MarkingInstructionScope = "standing" | "assessment";
export interface MarkingInstructionRow {
  id: number;
  scope: MarkingInstructionScope;
  programme: Programme | null; // standing only; null = every programme
  assessment_id: number | null; // set when scope = 'assessment'
  text: string;
  created_at: string;
}
