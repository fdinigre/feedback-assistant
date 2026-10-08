import Link from "next/link";

/**
 * "· not yet reviewed", linked to the criterion on each paper where the judgement
 * is still the tool's alone. A warning that says something is unsettled without
 * saying where to settle it only sends her hunting.
 */
export function UnreviewedLinks({
  papers,
  criterion,
}: {
  papers: { submissionId: number; assessmentTitle: string }[];
  criterion: string;
}) {
  if (papers.length === 0) return null;
  const linkClass = "underline decoration-amber-300 underline-offset-2 hover:text-amber-800";
  const href = (submissionId: number) => `/submissions/${submissionId}#criterion-${criterion}`;

  return (
    <span className="text-amber-700">
      {" · "}
      {papers.length === 1 ? (
        <Link href={href(papers[0].submissionId)} className={linkClass}>
          not yet reviewed
        </Link>
      ) : (
        <>
          not yet reviewed on{" "}
          {papers.map((p, i) => (
            <span key={p.submissionId}>
              {i > 0 && ", "}
              <Link href={href(p.submissionId)} className={linkClass}>
                {p.assessmentTitle}
              </Link>
            </span>
          ))}
        </>
      )}
    </span>
  );
}
