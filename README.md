# Feedback Assistant

A tool for IB mathematics teachers that turns scanned, handwritten assessments
into evidence-anchored marking and written feedback: per-question marks,
criterion levels (MYP) or markscheme marks and grades (DP), a full analytical
report per student cross-referenced with MAP and CAT4, and a Toddle-ready
feedback comment in your own voice.

It runs on your own Mac. Your classes, students, scans and marks stay in a
folder on your computer — there is no cloud database and no account to create.
The AI reading and marking runs on **Gemini, signed in with your
@thekaustschool.org Google account**, the account the school has approved for
student work. Gemini's free allowance is weekly; if it runs out mid-marking,
**Settings → AI** switches to Claude (it needs your own Claude Pro or Max
account) until it resets.

## Getting it

Open **Terminal** on your Mac (⌘-Space, type `Terminal`, Return), paste this
line and press Return:

```
curl -fsSL https://raw.githubusercontent.com/fdinigre/feedback-assistant/main/scripts/get.sh | bash
```

It downloads the app into a **Feedback Assistant** folder in your home folder
and sets it up — about five minutes, no administrator password. At the end,
sign in with your **@thekaustschool.org** account, not a personal Gmail. The
full guide is in **SETUP - START HERE.md**.

Please don't use **Code → Download ZIP**: macOS blocks apps downloaded through
a browser ("Apple could not verify…"), and only an administrator can let them
through. Downloading through Terminal avoids that.

From then on, open the app with the **Feedback Assistant** icon, and get new
versions with **Update Feedback Assistant**. Updates never touch your classes,
students, scans, marks or reports.

## What it sends to the AI, and what it doesn't

- **Students are never named.** Each student gets a code; the app refuses to
  send anything that still contains a name from your rosters.
- **The name on the scan is blacked out** on page 1 (and any other page you
  add a mask to) before the image is sent. For work that carries no names — a
  typed report handed in as a file — you can set an assessment to need no mask;
  a typed PDF is then checked for names from the class list before it is sent.
- **Only your school account, on Gemini.** Before every Gemini call the app
  checks which Google account it is signed in to, and stops if it is not a
  @thekaustschool.org one. If you switch to Claude in Settings → AI, work goes
  to your own Claude account instead — still with codes for names and page 1
  masked — and Settings shows which account each is signed in as.
- **Everything sent is logged** first, under Settings → AI request log, so you
  can see exactly what went.

Two honest limits: only the pages you mask are hidden in the scan images, so
keep names off any unmasked page; and the name check reads text, not the pixels
inside a scan.

## How it works

1. **Classes** — create a class (MYP or DP, and your own name for the course),
   then paste the roster. Import MAP, CAT4 and prior grades from spreadsheets
   if you have them.
2. **Assessments** — set the test up once: the questions and their points, the
   level band and learning target of each, the thresholds, and the worked
   solution. An MYP task is marked on the criteria or as a points test; a DP
   paper against its markscheme.
3. **Scans** — upload one PDF per student and assign each to its student.
4. **Transcription** — the AI writes out each student's working and flags
   anything it cannot read. It never guesses; you resolve the flags.
5. **Marking** — two passes: a marker that must cite the student's working for
   every point, and an independent stricter marker that can only lower marks.
   Where they disagree you see both side by side; until you choose, the
   stricter mark stands.
6. **Your own marks, optionally** — upload your marks spreadsheet and the app
   shows every question where you and it disagree, for you to settle.
7. **Reports** — strengths, areas to work on, next steps, and the Toddle
   comment in your voice (add two of your own comments in Settings so it
   sounds like you). Edit anything, then **Approve**: that records every mark
   and level on the paper as yours.
8. **Students** — each student's page gathers their levels over time, the
   skills and mistakes that keep coming back, and a conference view you can
   show a parent.

## Rules built into the marking

- Points become a level by **per-band thresholds**, set per assessment.
- **Any point means at least level 1**; level 0 needs zero points everywhere.
- **A skipped band costs a level** for each earlier band not completed.
- **Crossed-out work earns nothing**, even when it is correct.
- **Follow-through**: an error carried forward is not penalised twice when the
  later method is right.

---

## For maintainers

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # the automated checks (maintainer's repository only)
```

- All data lives in `data/` (SQLite database, uploaded scans, rendered pages,
  the AI request log). It is gitignored and never part of a release.
- The AI backend is chosen in **Settings → AI**, taking effect on the next
  request; until a choice is made there, by `MFA_AI_PROVIDER` in `.env.local`
  (`gemini` or `claude`). Colleagues' copies start on Gemini — the installer
  writes it — and can switch to Claude in Settings if they have an account.
- Releases are published from the maintainer's copy with **Publish an
  Update**, which refuses unless the code is committed and pushed, every check
  passes, and the release contains no student data and no roster name. This
  repository holds those releases only.
- `app/` — the pages; `lib/pipeline/` — transcribe → grade → report;
  `lib/ai/` — the Gemini and Claude adapters, each with the privacy guard and
  logging; `lib/db/` — schema and queries. The checks in `tests/` live in the
  maintainer's repository and are not part of a release.
