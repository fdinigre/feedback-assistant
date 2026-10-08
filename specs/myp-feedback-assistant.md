# MYP Math Feedback Assistant (v1)

## Objective

A local tool for one teacher that turns scanned handwritten MYP mathematics assessments (Grades 9/10, ~90 students across 3 classes) into evidence-anchored grading and written feedback: per-question marks, a criterion level, a full analytical report per student (cross-referenced with MAP/CAT4 data), and a Toddle-ready feedback comment written in the teacher's own voice. It replaces the current ad-hoc AI workflow, which misreads handwriting, overestimates student performance, cannot ground level judgments in evidence from the student's work, and produces generic feedback with weak next steps. All UI and output in English.

## Scope

**In scope (v1):**
- Paper assessments for Grades 9 and 10, all MYP criteria as they occur on paper: Criterion A (purely mathematical questions), B and D (calculation + text, graded against a worked solution *and* a task-specific rubric), C (always assessed alongside another criterion in the same assessment)
- The full flow: assessment setup → batch intake of scanned PDFs (one per student) → transcription with illegibility flagging → evidence-anchored grading with a conservative second pass → teacher review/edit → outputs (report, Toddle comment, spreadsheet row, cover summary)
- Class roster management and periodic import of external assessment data (MAP, CAT4)
- Per-student dossier: reports accumulate over the year and are exportable for reuse as context in the teacher's Gemini gem

**Out of scope (v1):**
- The project-based Financial Math class (digital documents and spreadsheets) — planned for v2
- Automatic publishing to Toddle or PowerSchool — the teacher pastes the comment and enters the grade manually
- Grading digital submissions of any kind
- Any flow that sends student names or identifiable data to a cloud service (see Non-functional)
- Multi-teacher / multi-tenant use; this is a single-teacher tool

## Requirements

### Functional

**Roster and external data**
1. The teacher maintains class lists (student name, class, grade). Each student gets an internal pseudonym code used in all AI calls (see Non-functional).
2. The teacher imports MAP and CAT4 data per student from dashboard exports (~2x per year): MAP achievement percentile and per-strand deltas (e.g., Geometry, Number Systems), CAT4 SAS scores (Quantitative, Spatial, Mean, etc.). Re-import replaces previous values. A student without external data is handled gracefully (see Edge cases).

**Assessment setup (once per assessment)**
3. The teacher defines: the criterion or criteria assessed (C always paired with another criterion), the list of questions, points per question, and the mapping of questions to MYP level bands (e.g., Q1–Q4 → levels 1–2).
4. Point boundaries per band: the points needed to reach the lower band of a level pair (e.g., 5–6) and the points needed to reach the upper level (e.g., 6), following the teacher's existing markscheme practice.
5. Each question is tagged with the **learning target** it assesses. Learning targets flow through to grading output, the spreadsheet, and the report (strengths/gaps described per target, not just per question).
6. Every assessment has a **worked solution** (defines full and partial credit, including follow-through rules). Criterion B and D assessments additionally have a **task-specific rubric**; for these, the worked solution is a *reference*, not a rigid answer key — student solution paths may legitimately differ, and the final judgment anchors on the rubric.

**Batch intake**
7. Input is one PDF per student (scanned on the school printer/scanner, saved to Drive; the tool reads them from a local folder). The teacher assigns each PDF to a student from the roster.
8. Extra pages (usually scratch work) are accepted and marked as scratch; they are transcribed but not graded unless the teacher includes them.

**Transcription (honest, never guessing)**
9. The tool reconstructs the student's mathematical steps per question from the scan.
10. Any segment it cannot read with confidence is **flagged as illegible** — visibly marked, never silently guessed. The teacher resolves flags (types the correct content or confirms it is illegible) before grading proceeds for that question.

**Grading (evidence before judgment)**
11. Partial credit is awarded according to the worked solution, including **follow-through**: an error carried forward does not re-penalize subsequent correct method.
12. Every mark and every claimed rubric level must **cite the specific step in the student's work** that evidences it. No evidence, no claim.
13. A **conservative second pass** independently attempts to *lower* the proposed marks/level. Where the two passes disagree, both positions and their evidence are shown; the teacher decides. This is the mechanism against the overestimation problem.
14. The criterion level (0–8) is computed from the point boundaries defined in setup (Criterion A) or proposed from the rubric with cited evidence (B/D); the teacher confirms or overrides.

**Teacher review**
15. The teacher can edit everything before anything is final: the transcription, per-question points, the criterion level, and every piece of generated text. Nothing is exported without passing through review.

**Outputs (per student, all in English)**
16. **Full report**, following the structure of the teacher's existing reports (reference: "Trig test analysis"):
    - *Data Correlation (Internal Insight)* — test performance cross-referenced with MAP percentile/deltas and CAT4 SAS
    - *Strengths* — bullets, each citing question numbers and topics
    - *Areas for Improvement* — bullets naming the specific error pattern with question evidence
    - *Actionable Steps* — concrete, named techniques and drills
    - *Feedback Comment* — the Toddle paragraph (see 17)
17. **Toddle comment**, paste-ready, in the teacher's voice: addresses the student by name using "you"; a single paragraph of roughly 70–90 words; structure = specific strength with evidence → the specific errors that limited the score → an actionable next step tied to level-band language ("to move into the Level 7–8 bracket…"); encouraging without inflating. Calibrated from the teacher's real examples (stored in the tool as the style reference).
18. **Spreadsheet row** per student: per-question points, total, criterion level, learning targets missed — matching the teacher's existing grade spreadsheet workflow (export as CSV or copyable rows).
19. **Cover summary**: a compact per-question points + level view for the teacher to hand-write on the first page of the test.
20. **Dossier**: each report is archived per student and the accumulated dossier is exportable (Markdown or docx) for use as AI context (Gemini gem).

### Non-functional

- **Privacy — hard rule:** student names and identifiable data stay on the teacher's machine (or the school's Gemini, outside this tool). Any call to a cloud AI uses the pseudonym code, never the name; names are re-injected locally into final outputs. The handwritten name on the scan's first page must not be sent to the cloud (masked/cropped/excluded before upload).
- **Cost:** AI usage via the teacher's Claude subscription (Claude Code CLI, headless) is the default. Paid API is acceptable **only if** subscription-based accuracy proves insufficient for handwritten math reading — measured against real scans before deciding, not assumed.
- **Language:** entire UI and all outputs in English.
- **Timeline:** usable for the first summative assessment of the 2026–27 school year (August 2026). Note this competes for build time with the MathReps pilot, also August 2026.
- **Volume:** batches of ~30 students per class, ~90 students total; multi-page PDFs per student.

### Inputs and outputs

| Direction | What | Format / source |
|---|---|---|
| In | Scanned tests | One PDF per student, from scanner via Drive, read from a local folder |
| In | Assessment definition | Entered in the tool: questions, points, level bands, boundaries, learning targets, worked solution, task-specific rubric (B/D) |
| In | Roster | Class lists (student name, class, grade) |
| In | MAP/CAT4 data | CSV/spreadsheet consolidated from dashboard exports, ~2x/year |
| In | Style reference | The teacher's real feedback examples (seed provided; more can be added) |
| Out | Full report | Per student, archived in dossier; exportable Markdown/docx |
| Out | Toddle comment | Paste-ready text per student |
| Out | Grade data | CSV / copyable rows: per-question points, total, level, learning targets |
| Out | Cover summary | Compact per-question view for hand-writing on the test |

## Edge cases

- **Illegible segment** → flagged; that question's grading is blocked until the teacher resolves the flag or marks the segment as ungradeable (graded as-is with the illegible part earning no credit, noted in the report).
- **Blank question or section** → zero marks with an explicit note; the report reflects it honestly (completion/pacing framed as an area for improvement, not glossed over).
- **Student solution path differs from the worked solution (B/D)** → graded on mathematical validity against the rubric, not similarity to the reference; flagged for teacher attention.
- **Follow-through situation** → a wrong intermediate result carried into later steps earns method marks per the worked solution's follow-through rules.
- **Conservative pass disagrees with the first pass** → both proposals shown side by side with their evidence; the teacher's choice is final.
- **Student absent / no PDF** → marked absent; excluded from batch outputs without blocking the rest of the batch.
- **Two PDFs assigned to the same student** → warning before grading.
- **Suspected missing page** (e.g., question present in the assessment definition but absent from the scan) → warning before grading, so a scanning error isn't graded as a blank.
- **PDF unreadable / corrupt scan** → clear error identifying the file; the rest of the batch proceeds.
- **Student missing MAP/CAT4 data** → report generated without the Data Correlation section, with a note; never invented.
- **Scratch pages** → transcribed and viewable, excluded from grading unless the teacher includes them.

## Definition of done

Verified against a **real past assessment** the teacher has already graded by hand (e.g., the trigonometry test whose analysis document exists), by re-running it through the tool:

- [ ] Teacher can set up an assessment with questions, points, level-band mapping, point boundaries, learning targets, worked solution — and a task-specific rubric for a B/D assessment.
- [ ] Teacher can import a class roster and a MAP/CAT4 CSV.
- [ ] Teacher can load a batch of per-student PDFs and assign each to a student; absent students and duplicates are handled as specified.
- [ ] Transcription of a real handwritten test shows the student's steps with illegible segments visibly flagged, and the teacher can correct them.
- [ ] Grading output cites a specific student step for every mark/level claim, applies partial credit and follow-through per the worked solution, and shows the conservative pass's disagreements.
- [ ] On the benchmark batch, the tool's proposed levels match the teacher's original grades closely enough that her role is *editing*, not rewriting (teacher's judgment on the side-by-side comparison).
- [ ] For each student, the tool produces: the full report (all five sections), the Toddle comment in the teacher's voice, the spreadsheet row, and the cover summary — all in English.
- [ ] The Toddle comment for at least 3 benchmark students is judged by the teacher as "I would paste this after light edits".
- [ ] No student name appears in any outbound AI request (verifiable by inspecting the request log).
- [ ] The dossier export produces a file the teacher successfully uses as context in her Gemini gem.

## Open questions

1. **Name masking on page 1:** simplest reliable approach — a fixed "name zone" cropped from every first page (works if the test template has the name field in a consistent position), or teacher-drawn mask per batch? Decide during build; the hard rule (no names to cloud) stands either way.
2. **Subscription accuracy threshold:** what error rate on handwritten transcription is acceptable before switching the vision step to the paid API? Proposal: measure on 5 real scans during the first build milestone and decide with the teacher on real numbers.
3. **Grade 9 vs Grade 10 syllabi:** learning targets differ by grade (9 Extended, 10 Standard). Confirm whether learning targets should be a shared catalog (reusable across assessments, enabling year-long aggregation like MathReps skills) or free text per assessment. Shared catalog recommended.

---

# Addendum — v1.1 (built 2026-07-11, same-day extensions)

Features added beyond the v1 spec during first real use (blind benchmark on a
real G10 quiz), all requested by the teacher:

## Grading rules (standing, all future assessments)
- Point→level conversion uses **per-band-section thresholds** (points within
  each band's questions), not cuts on the assessment total.
- Floor of 1: any point anywhere → at least level 1.
- Skipped-band penalty: highest level achieved minus 1 per earlier band failed.
- Crossed-out / scratched-over work earns no credit, even when correct.
- Criterion C calibrated to Criterion A ± 1 (± 2 only with clear descriptor
  support); the C-level prompt receives the proposed A level as anchor.

## Review page
- Independently scrolling PDF / transcript columns; sticky marks summary strip
  (per-question points, total, levels, conservative-disagreement markers) at
  the top; save feedback ("Saved ✓" / error); natural question ordering
  (1, 2, 3, 4a, 4b …).

## Imports
- External data accepts CSV, TSV, paste, and XLSX with arbitrary column
  layouts; blank rows skipped; name column stripped from stored data.
- Four sources: MAP, CAT4, PRIOR_GRADES (previous-year criteria A–D), ATL.
- Downloadable per-source XLSX templates.
- The report prompt carries a fixed interpretation guide for MAP (RIT,
  percentile bands, Met Growth, strand deltas ≥5 meaningful) and CAT4 (SAS
  mean 100 / SD 15; Quantitative + Spatial most predictive for maths;
  potential-vs-attainment comparison required).

## New pages
- **Dashboard**: "Needs your attention" action list (unresolved flags, draft
  reports, incomplete setup, unassigned/duplicate submissions), per-assessment
  progress strips, per-class external-data coverage.
- **Settings**: style-example management (feedback voice few-shots), AI
  request log with prompt viewer (privacy audit), data-location note.
- **Students** (index + profile): trajectory header (levels vs prior year),
  learning-target mastery (weakest first, evidence counts), recurring
  patterns (mechanical aggregation + optional on-demand AI digest, cached in
  data/insights/), potential-vs-attainment (CAT4 ≥112 & level ≤4 rule),
  ATL chips, dossier + next-steps checklist, writing/legibility signals.
- **Excel export** per assessment (frozen headers, per-question columns,
  levels with conservative notes, missed learning targets, class averages).

## Sub-part transcription
- Assessments define sub-parts as separate questions (4a, 4b). A separate
  fix (own worktree) improves the matcher for sub-part outputs.
