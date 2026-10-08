"use client";

import { LEVEL_BANDS } from "@/lib/assessment/bands";
import { describeSuggestion, suggestLevel } from "@/lib/assessment/descriptor-band";
import type {
  CriterionLevelRow,
  DescriptorCheckRow,
  RubricDescriptorRow,
  SaveStatus,
} from "@/lib/types";

/** The tick on record: the teacher's where she has made one, else the grader's. */
function tickOf(check: DescriptorCheckRow | undefined): boolean | null {
  const value = check?.met_final ?? check?.met_proposed ?? null;
  return value === null ? null : value === 1;
}

/**
 * What the grader decided about each statement of the rubric, band by band.
 * The level beside it stays the teacher's: the ticks only say what they imply.
 */
function DescriptorChecklist({
  criterion,
  descriptors,
  checkByDescriptorId,
  onToggleDescriptor,
}: {
  criterion: string;
  descriptors: RubricDescriptorRow[];
  checkByDescriptorId: Record<number, DescriptorCheckRow>;
  onToggleDescriptor: (criterion: string, descriptorId: number, met: boolean) => void;
}) {
  if (descriptors.length === 0) return null;
  const suggestion = suggestLevel(
    descriptors.map((d) => ({ band: d.band, met: tickOf(checkByDescriptorId[d.id]) === true }))
  );

  return (
    <div className="mt-3 rounded border border-slate-200">
      <div className="flex items-baseline justify-between border-b border-slate-200 px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Rubric descriptors
        </span>
        <span className="text-xs font-medium text-slate-700">{describeSuggestion(suggestion)}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {LEVEL_BANDS.map((band) => {
          const inBand = descriptors.filter((d) => d.band === band);
          if (inBand.length === 0) return null;
          const count = suggestion.countsByBand[band];
          return (
            <div key={band} className="px-3 py-2">
              <p className="text-xs font-semibold text-slate-700">
                Level {band}{" "}
                <span className="font-normal text-slate-500">
                  — {count.met} of {count.total} met
                </span>
              </p>
              <ul className="mt-1 space-y-1.5">
                {inBand.map((d) => {
                  const check = checkByDescriptorId[d.id];
                  const tick = tickOf(check);
                  const overridden =
                    check?.met_final != null && check.met_proposed != null &&
                    check.met_final !== check.met_proposed;
                  return (
                    <li key={d.id} className="text-sm">
                      <label className="flex items-start gap-1.5">
                        <input
                          type="checkbox"
                          checked={tick === true}
                          onChange={(e) => onToggleDescriptor(criterion, d.id, e.target.checked)}
                          title={d.text}
                          className="mt-1 h-3.5 w-3.5 shrink-0 accent-slate-900"
                        />
                        <span className={tick === true ? "text-slate-800" : "text-slate-600"}>
                          {d.strand ? `${d.strand}. ` : ""}
                          {d.student_text ?? d.text}
                          {tick === null && (
                            <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-900">
                              not judged
                            </span>
                          )}
                          {overridden && (
                            <span className="ml-1 text-xs text-slate-500">
                              (you changed this; the grader said{" "}
                              {check!.met_proposed === 1 ? "met" : "not met"})
                            </span>
                          )}
                        </span>
                      </label>
                      {check?.evidence && (
                        <p className="ml-5 text-xs text-slate-500">{check.evidence}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SaveStatusNote({ status }: { status: SaveStatus | undefined }) {
  if (!status) return null;
  if (status.kind === "success") {
    return <span className="text-xs font-medium text-emerald-700">Saved ✓</span>;
  }
  return <span className="text-xs font-medium text-rose-700">{status.message}</span>;
}

export function CriterionLevelPanel({
  levels,
  descriptors,
  checkByDescriptorId,
  onToggleDescriptor,
  onLevelFinalChange,
  onSave,
  saving,
  statuses,
}: {
  levels: CriterionLevelRow[];
  descriptors: RubricDescriptorRow[];
  checkByDescriptorId: Record<number, DescriptorCheckRow>;
  onToggleDescriptor: (criterion: string, descriptorId: number, met: boolean) => void;
  onLevelFinalChange: (criterion: string, value: number) => void;
  onSave: (criterion: string) => void;
  saving: Record<string, boolean>;
  statuses?: Record<string, SaveStatus | undefined>;
}) {
  if (levels.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
        No criterion levels yet. Run grading first.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {levels.map((cl) => {
        const disagree = cl.level_proposed !== cl.level_conservative;
        return (
          <div
            key={cl.criterion}
            // The "not reviewed" label on a student's profile links straight here.
            id={`criterion-${cl.criterion}`}
            className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-4"
          >
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
              Criterion {cl.criterion}
            </h3>
            <div
              className={`grid grid-cols-2 gap-3 rounded p-3 ${
                disagree ? "border border-amber-300 bg-amber-50" : "bg-slate-50"
              }`}
            >
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Proposed level</p>
                <p className="text-lg font-semibold">{cl.level_proposed}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Conservative level</p>
                <p className="text-lg font-semibold">{cl.level_conservative}</p>
              </div>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
              <span className="font-semibold">Evidence: </span>
              {cl.evidence}
            </p>

            <DescriptorChecklist
              criterion={cl.criterion}
              descriptors={descriptors.filter((d) => d.criterion === cl.criterion)}
              checkByDescriptorId={checkByDescriptorId}
              onToggleDescriptor={onToggleDescriptor}
            />
            <div className="mt-3 flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600">Final level</label>
              <input
                type="number"
                min={0}
                max={8}
                value={cl.level_final ?? cl.level_conservative}
                onChange={(e) => onLevelFinalChange(cl.criterion, Number(e.target.value))}
                className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => onSave(cl.criterion)}
                disabled={saving[cl.criterion]}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {saving[cl.criterion] ? "Saving…" : "Save"}
              </button>
              <SaveStatusNote status={statuses?.[cl.criterion]} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
