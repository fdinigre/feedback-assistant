import type { AtlStanding } from "@/lib/atl/history";
import { ATL_BY_CLUSTER, ATL_LEVELS, atlLevelIndex } from "@/lib/atl/rubric";

/** The four rungs, with the one they are on filled. SVG so it survives printing. */
function AtlScale({ level }: { level: string }) {
  const index = ATL_LEVELS.indexOf(level as (typeof ATL_LEVELS)[number]);
  return (
    <svg viewBox="0 0 84 8" className="h-2 w-28 text-blue-600" role="img" aria-label={level}>
      {ATL_LEVELS.map((_, i) => (
        <rect
          key={i}
          x={i * 21}
          y={0}
          width={18}
          height={8}
          rx={2}
          fill="currentColor"
          fillOpacity={i < index ? 0.3 : i === index ? 1 : 0}
          stroke={i > index ? "currentColor" : "none"}
          strokeOpacity={0.4}
        />
      ))}
    </svg>
  );
}

const TREND: Record<string, string> = { up: "↑", down: "↓", same: "→" };

export function AtlPanel({ standings }: { standings: AtlStanding[] }) {
  if (standings.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
        Nothing yet. Each approved report names one approach-to-learning skill the paper gave
        evidence for, and those collect here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {standings.map((standing) => {
        const skill = ATL_BY_CLUSTER[standing.cluster];
        return (
          <article
            key={standing.cluster}
            className="break-inside-avoid rounded-lg border border-slate-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h3 className="font-sans text-base font-semibold">{standing.cluster}</h3>
                <p className="mt-0.5 text-sm text-slate-600">{skill.scope}</p>
              </div>
              <div className="flex items-center gap-3">
                <AtlScale level={standing.current} />
                <span className="text-sm font-semibold">
                  {standing.current}
                  {standing.trend && standing.trend !== "same" && (
                    <span
                      className={
                        standing.trend === "up" ? "ml-1 text-blue-700" : "ml-1 text-amber-700"
                      }
                    >
                      {TREND[standing.trend]}
                    </span>
                  )}
                </span>
              </div>
            </div>

            <p className="mt-3 text-[15px] leading-relaxed">
              {skill.iCan[standing.current]}
            </p>

            {/* The evidence is written for her and may be blunt, so it stays shut
                until she opens it. */}
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-600">
                {standing.observations.length} observation
                {standing.observations.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-2 space-y-2">
                {[...standing.observations].reverse().map((o, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{o.level}</span>
                    <span className="text-slate-500"> · {o.assessmentTitle}</span>
                    {o.evidence && (
                      <span className="block text-slate-600">{o.evidence}</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>

            {atlLevelIndex(standing.current) < ATL_LEVELS.length - 1 && (
              <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-700">
                <span className="font-medium">Next: </span>
                {skill.descriptors[ATL_LEVELS[atlLevelIndex(standing.current) + 1]][0]}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
