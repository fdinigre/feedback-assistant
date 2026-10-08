/**
 * The two pictures the conference profile is built from.
 *
 * Both are inline SVG rather than divs, and that is not a style preference.
 * Chrome's print dialog has "Background graphics" switched off by default,
 * which drops every CSS background-color — so a bar chart made of filled divs
 * prints as a blank rectangle on the one page in this app whose whole purpose
 * is to be printed and handed to someone. SVG fills are graphic content and
 * print either way.
 *
 * Colour comes from currentColor throughout, so these inherit whatever text-*
 * class wraps them and reskin with the palette for free. No props, no server
 * imports: the multi-student pack renders these client-side.
 */

const BANDS: [number, number][] = [
  [1, 2],
  [3, 4],
  [5, 6],
  [7, 8],
];

/** Which MYP band a level falls in, 0-3. Levels run 1-8; 0 means not assessed. */
function bandIndexOf(level: number): number {
  return BANDS.findIndex(([lo, hi]) => level >= lo && level <= hi);
}

export function bandLabelOf(level: number): string | null {
  const band = BANDS[bandIndexOf(level)];
  return band ? `${band[0]}–${band[1]}` : null;
}

const CELL = 18;
const GAP = 3;

/**
 * The 1-8 strip with the student's level filled in. Cells below the level
 * darken band by band, so the shape of the track says "which band" before the
 * number is read; cells above are outlines.
 */
export function BandTrack({
  level,
  max = 8,
  prior = null,
  tone = "blue",
}: {
  level: number;
  max?: number;
  /** Where they finished last year, marked with a tick beneath the strip. */
  prior?: number | null;
  tone?: "blue" | "amber";
}) {
  const width = max * (CELL + GAP) - GAP;
  const accent = tone === "amber" ? "text-amber-500" : "text-blue-600";

  return (
    <svg
      viewBox={`0 0 ${width} ${prior ? 18 : 12}`}
      className="h-auto w-full text-slate-400"
      role="img"
      aria-label={`Level ${level} of ${max}`}
    >
      {Array.from({ length: max }, (_, i) => {
        const value = i + 1;
        const x = i * (CELL + GAP);
        if (value === level) {
          return (
            <rect
              key={value}
              x={x}
              y={0}
              width={CELL}
              height={10}
              rx={2}
              className={accent}
              fill="currentColor"
            />
          );
        }
        if (value < level) {
          // 0.3 at the bottom band through 0.6 at the top: a visible climb,
          // never dark enough to be mistaken for the level they actually got.
          return (
            <rect
              key={value}
              x={x}
              y={0}
              width={CELL}
              height={10}
              rx={2}
              fill="currentColor"
              fillOpacity={0.3 + bandIndexOf(value) * 0.1}
            />
          );
        }
        return (
          <rect
            key={value}
            x={x + 0.5}
            y={0.5}
            width={CELL - 1}
            height={9}
            rx={2}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.45}
          />
        );
      })}
      {prior ? (
        <g className="text-slate-500">
          <title>{`Finished last year at ${prior}`}</title>
          <path
            d={`M${(prior - 1) * (CELL + GAP) + CELL / 2 - 3} 17 L${(prior - 1) * (CELL + GAP) + CELL / 2} 13 L${(prior - 1) * (CELL + GAP) + CELL / 2 + 3} 17 Z`}
            fill="currentColor"
          />
        </g>
      ) : null}
    </svg>
  );
}

export type ChartBar = {
  label: string;
  level: number;
  /** Drawn hollow: the tool's reading, with no review behind it. */
  provisional?: boolean;
  /** Dimmed and grouped to the left: a year that is already finished. */
  past?: boolean;
};

const SLOT = 34;
const BAR = 24;
const PLOT = 54;

/**
 * Levels over time, oldest first, with a dashed line where the student finished
 * the year before. Bars are evenly spaced inside their slots so an HTML grid of
 * the same column count lines its labels up underneath.
 */
export function LevelBars({
  bars,
  max = 8,
  prior = null,
  priorLabel = "last year",
}: {
  bars: ChartBar[];
  max?: number;
  prior?: number | null;
  priorLabel?: string;
}) {
  if (bars.length === 0) return null;
  const width = bars.length * SLOT;
  const priorY = prior ? PLOT - (prior / max) * PLOT : null;
  const firstCurrent = bars.findIndex((b) => !b.past);
  const divider = firstCurrent > 0 ? firstCurrent * SLOT - GAP : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${PLOT + 14}`}
      // Fixed height with a stretched viewBox: the bars widen to fill the
      // column instead of the whole chart growing taller as it gets wider.
      className="h-24 w-full text-blue-600"
      preserveAspectRatio="none"
      role="img"
      aria-label={bars.map((b) => `${b.label}: ${b.level}`).join("; ")}
    >
      <line
        x1={0}
        y1={PLOT}
        x2={width}
        y2={PLOT}
        stroke="currentColor"
        strokeOpacity={0.3}
        className="text-slate-500"
        vectorEffect="non-scaling-stroke"
      />
      {priorY !== null ? (
        <g className="text-slate-500">
          <title>{`${priorLabel}: ${prior}`}</title>
          <line
            x1={0}
            y1={priorY}
            x2={width}
            y2={priorY}
            stroke="currentColor"
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ) : null}
      {divider !== null ? (
        <line
          x1={divider}
          y1={0}
          x2={divider}
          y2={PLOT}
          stroke="currentColor"
          strokeOpacity={0.35}
          className="text-slate-500"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {bars.map((bar, i) => {
        const height = Math.max((bar.level / max) * PLOT, 2);
        const x = i * SLOT + (SLOT - BAR) / 2;
        const y = PLOT - height;
        const latest = i === bars.length - 1;
        return (
          <g key={`${bar.label}-${i}`}>
            <title>{`${bar.label}: ${bar.level}${bar.provisional ? " (not yet reviewed)" : ""}`}</title>
            <rect
              x={bar.provisional ? x + 0.5 : x}
              y={bar.provisional ? y + 0.5 : y}
              width={bar.provisional ? BAR - 1 : BAR}
              height={bar.provisional ? Math.max(height - 1, 1) : height}
              fill="currentColor"
              fillOpacity={bar.provisional ? 0.22 : bar.past ? 0.3 : latest ? 1 : 0.55}
              stroke={bar.provisional ? "currentColor" : undefined}
              strokeDasharray={bar.provisional ? "3 2" : undefined}
              vectorEffect={bar.provisional ? "non-scaling-stroke" : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
}
