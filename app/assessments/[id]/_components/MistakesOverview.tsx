import Link from "next/link";
import type { AssessmentMistakes, MistakeRow } from "@/lib/assessment/mistakes";

// One hue for the bars (a single series: the title names it, so no legend), and
// the same hue light-to-dark for the question grid, where darker is more students.
const BAR = "#2a78d6";
// The light end starts at a step that still stands out from the white card: one
// student is worth seeing.
const RAMP = ["#86b6ef", "#5598e7", "#256abf", "#184f95", "#0d366b"];
/** Steps from here on are dark enough to carry white text. */
const WHITE_TEXT_FROM = 2;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A question number as a short heading: "Q3a", or a part label without its "Part". */
function shortLabel(number: string): string {
  if (/^\d/.test(number)) return `Q${number}`;
  const bare = number.replace(/^(part|question)\s+/i, "");
  return bare.length > 8 ? `${bare.slice(0, 7)}…` : bare;
}

/**
 * Column headings for the grid. Short labels while they stay distinct; when two
 * would read the same ("Part A – Solve…", "Part A – Use…"), the columns are
 * numbered instead, with a key under the grid giving each question in full.
 */
function columnHeadings(numbers: string[]): { headings: string[]; keyed: boolean } {
  const short = numbers.map(shortLabel);
  if (new Set(short).size === short.length) return { headings: short, keyed: false };
  return { headings: numbers.map((_, i) => String(i + 1)), keyed: true };
}

/**
 * The class view of the mistake sorting: how many students made each kind of
 * mistake and in which core skill, and on which questions. Each bar opens to the
 * students behind it and the marking that put them there.
 */
export function MistakesOverview({ assessmentId, data }: { assessmentId: number; data: AssessmentMistakes }) {
  if (data.papers === 0) return null;

  if (data.sortedPapers === 0) {
    return (
      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Mistakes in this assessment</h2>
        <p className="mt-1 text-sm text-slate-600">
          Not sorted yet. Run &ldquo;Mistakes&rdquo; (stage 4) on the{" "}
          <Link href={`/assessments/${assessmentId}/submissions`} className="underline underline-offset-2">
            submissions page
          </Link>{" "}
          and the class&apos;s mistakes show here.
        </p>
      </section>
    );
  }

  const n = data.sortedPapers;
  const maths = data.kinds.filter((k) => k.about === "maths");
  const question = data.kinds.filter((k) => k.about === "question");

  return (
    <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Mistakes in this assessment</h2>
        <span className="text-xs text-slate-500">
          {n === data.papers
            ? `All ${plural(n, "paper")} sorted`
            : `${n} of ${data.papers} graded papers sorted — the rest are not counted yet`}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        How many students made each kind of mistake. Open a row to see who, on which questions, and what the
        marking said.
      </p>

      {data.kinds.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">The sorting found no mistakes of a kind it tracks on these papers.</p>
      ) : (
        // One column for every group, so all the bars share one scale.
        <div className="mt-5 space-y-6">
          <BarGroup title="In the maths itself" rows={maths} sorted={n} />
          <BarGroup title="In doing what the question asks" rows={question} sorted={n} />
        </div>
      )}

      {data.skills.length > 0 && (
        <div className="mt-6">
          <BarGroup title="Core skills it happened in" rows={data.skills} sorted={n} />
        </div>
      )}

      {data.columns.length > 0 && <QuestionGrid data={data} />}
    </section>
  );
}

function BarGroup({ title, rows, sorted }: { title: string; rows: MistakeRow[]; sorted: number }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      <ul className="mt-2 space-y-1">
        {rows.map((row) => (
          <li key={row.id}>
            <details className="group">
              <summary
                className="grid cursor-pointer list-none grid-cols-[minmax(0,18rem)_minmax(0,1fr)] items-center gap-3 rounded px-1 py-1 hover:bg-slate-50 [&::-webkit-details-marker]:hidden"
                title={`${row.name}: ${plural(row.students.length, "student")} of ${sorted}, on ${plural(row.questionCount, "question")}`}
              >
                <span className="text-sm leading-snug text-slate-800">
                  <span className="mr-1 inline-block w-3 text-slate-400 transition-transform group-open:rotate-90">›</span>
                  {row.name}
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className="block h-3 shrink-0 rounded-r"
                    style={{
                      background: BAR,
                      width: `calc((100% - 5.5rem) * ${row.students.length / sorted})`,
                      minWidth: "4px",
                    }}
                  />
                  <span className="shrink-0 text-xs tabular-nums text-slate-600">
                    {row.students.length} of {sorted}
                  </span>
                </span>
              </summary>
              <div className="mb-2 ml-5 mt-1 space-y-2 border-l border-slate-200 pl-3">
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {row.students.map((s) => (
                    <li key={s.submissionId}>
                      <Link
                        href={`/submissions/${s.submissionId}`}
                        className="text-slate-800 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600"
                      >
                        {s.name}
                      </Link>
                      {s.questions.length > 0 && (
                        <span className="text-xs text-slate-500">
                          {" "}
                          ({s.questions.map((q) => (/^\d/.test(q) ? `Q${q}` : q)).join("; ")})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {row.quotes.length > 0 && (
                  <ul className="space-y-1">
                    {row.quotes.map((q, i) => (
                      <li key={i} className="text-xs italic text-slate-600">
                        &ldquo;{q}&rdquo;
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Which question each kind of mistake fell on: a grid shaded by how many students. */
function QuestionGrid({ data }: { data: AssessmentMistakes }) {
  const max = Math.max(
    1,
    ...Object.values(data.grid).flatMap((row) => Object.values(row).map((c) => c.students.length))
  );
  const step = (count: number) => Math.min(RAMP.length - 1, Math.ceil((count / max) * RAMP.length) - 1);
  const legendCounts = [...new Set([1, Math.ceil(max / 2), max])].filter((c) => c >= 1);
  const { headings, keyed } = columnHeadings(data.columns.map((c) => c.number));

  return (
    <div className="mt-8">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Where each mistake happened</h3>
      <p className="mt-1 text-xs text-slate-500">
        Each square is the number of students who made that mistake on that question; darker is more. Hover a
        square to see who.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="border-separate border-spacing-[2px] text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white" />
              {data.columns.map((c, i) => (
                <th
                  key={c.id}
                  scope="col"
                  title={c.number}
                  className="min-w-9 whitespace-nowrap px-1 pb-1 text-center font-medium text-slate-600"
                >
                  {headings[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.kinds.map((kind) => (
              <tr key={kind.id}>
                <th
                  scope="row"
                  className="sticky left-0 max-w-[16rem] bg-white pr-3 text-left font-normal leading-tight text-slate-700"
                >
                  {kind.name}
                </th>
                {data.columns.map((c) => {
                  const cell = data.grid[kind.id]?.[c.id];
                  if (!cell) return <td key={c.id} className="h-8 min-w-9 rounded bg-slate-50" />;
                  const s = step(cell.students.length);
                  return (
                    <td
                      key={c.id}
                      title={`${c.number} — ${kind.name}: ${cell.students.join(", ")}`}
                      className="h-8 min-w-9 rounded text-center tabular-nums"
                      style={{ background: RAMP[s], color: s >= WHITE_TEXT_FROM ? "#ffffff" : "#0f172a" }}
                    >
                      {cell.students.length}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {keyed && (
        <ol className="mt-2 space-y-0.5 text-xs text-slate-600">
          {data.columns.map((c, i) => (
            <li key={c.id}>
              <span className="font-medium tabular-nums">{i + 1}</span> {c.number}
            </li>
          ))}
        </ol>
      )}
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
        <span>Students:</span>
        {legendCounts.map((count) => (
          <span key={count} className="flex items-center gap-1">
            <span className="inline-block h-3 w-4 rounded-sm" style={{ background: RAMP[step(count)] }} />
            {count}
          </span>
        ))}
      </div>
    </div>
  );
}
