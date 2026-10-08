# MYP Feedback Assistant

A local-only tool for one teacher that turns scanned handwritten MYP mathematics
assessments into evidence-anchored grading and written feedback: per-question
marks, criterion levels, a full analytical report per student (cross-referenced
with MAP/CAT4 data), and a Toddle-ready feedback comment written in the
teacher's own voice.

Your data is stored only on this machine — there is no cloud database or account.
The grading/report steps do send work to an AI (Claude or Gemini — see
`AI-BACKENDS.md`) to be read: before each call the
student is referred to by a pseudonym and page 1's handwritten-name area is masked
(you can add a mask on a second page too, in the assessment's Name mask section),
and every outbound request is logged to `data/ai-log/` for inspection (see Settings →
AI request log). Two honest limits: only the pages you mask are hidden in the scan
images (keep names off any unmasked page), and the name guard matches text, not the
pixels of scan images. So the accurate summary is *local storage with pseudonymized
external AI processing*, not "nothing ever leaves".

## Requirements

- Node.js 18+
- The `claude` CLI installed and **logged in** (`claude` → `/login` once).
  The app calls Claude headlessly through your subscription — no API key.

## Run

```bash
npm install
npm run dev
# open http://localhost:3000
npm test   # the automated checks; publishing a release refuses if any fails
```

All data lives in the `data/` directory (SQLite database, uploaded PDFs,
rendered pages, AI request log, cached insights). Back that folder up and
you've backed up everything. It is gitignored by design.

## Workflow

1. **Classes** — create a class, add the roster (paste a list or CSV).
   Pseudonyms are generated automatically. Import MAP / CAT4 / prior-year
   grades / ATL data from spreadsheets (templates downloadable on the page;
   arbitrary column layouts also work).
2. **Assessments** — define the test once: questions (sub-parts like `4a`
   as separate questions), points, level band per question, learning target
   per question, point thresholds per level (per band section), the worked
   solution, and — for criteria with rubrics — the task-specific rubric.
   Check the name-mask preview: the masked region of page 1 must cover the
   handwritten name and signature for **this** test's template.
3. **Submissions** — scan one PDF per student, upload the batch, assign each
   PDF to a student. Mark absentees.
4. **Run transcription** — the AI reconstructs each student's steps and flags
   anything it cannot read. **It never guesses.**
5. **Resolve the flags** — type what the segment actually says, or mark it
   unreadable (that segment then earns no credit). Grading refuses to run
   while flags are unresolved.
6. **Run grading** — two passes: an evidence-anchored marker (every point
   cites the student's step) and an independent conservative marker that can
   only lower marks. Disagreements are shown side by side; you decide.
7. **Generate report** — Data Correlation (MAP/CAT4 interpreted, not echoed),
   Strengths, Areas for Improvement, Actionable Steps, and the Toddle comment
   in your voice. Edit anything, then **Approve**.
8. **Outputs** — copy the Toddle comment, print the cover summary, export the
   assessment spreadsheet (Excel), and download each student's accumulated
   dossier (Markdown) for use as AI context elsewhere.

## Grading rules encoded in the tool

- Points → level uses **per-band thresholds** (points scored within each
  band's questions), teacher-configured per assessment.
- **Floor of 1**: any point anywhere means at least level 1.
- **Skipped-band penalty**: highest level reached minus 1 per earlier band
  the student failed to reach.
- **Crossed-out work earns nothing**, even when mathematically correct.
- **Follow-through**: an error carried forward is not re-penalized when the
  subsequent method is correct.
- Criterion C is calibrated to land within ±1 of Criterion A unless the
  rubric descriptors clearly justify more.

## Privacy model

- Page 1 of every scan is masked (name/signature region) before upload;
  the pipeline refuses to send an unmasked page 1.
- Prompts identify students only by pseudonym; a guard throws if any roster
  name would leave the machine, and generated text uses a `{{NAME}}` token
  that is re-injected locally.
- Every prompt sent to the AI is saved first under `data/ai-log/` —
  auditable in Settings.

## Project layout

- `specs/` — the product specification (`/spec` → `/build` → `/review` flow)
- `lib/pipeline/` — transcribe → grade → report (the AI pipeline)
- `lib/ai/claude.ts` — headless `claude` CLI wrapper (privacy guard + logging)
- `lib/db/` — SQLite schema and typed queries
- `app/` — Dashboard, Classes, Students, Assessments, Submissions review,
  Settings
