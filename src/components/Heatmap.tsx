"use client";

interface Props {
  totalDays: number;
  todayIdx: number;
  completedMap: Map<number, number>;
  frozenSet: Set<number>;
  habitCount: number;
}

export function Heatmap({ totalDays, todayIdx, completedMap, frozenSet, habitCount }: Props) {
  const activeDays = todayIdx < 0 ? 0 : Math.min(todayIdx + 1, totalDays);
  const cells = [];
  for (let i = 0; i < totalDays; i++) {
    const done = completedMap.get(i) ?? 0;
    const frozen = frozenSet.has(i);
    const future = i > todayIdx;
    let cls = "hm-future";
    let title = `Day ${i + 1}`;
    if (frozen) {
      cls = "hm-frozen";
      title += " · frozen";
    } else if (!future && habitCount > 0) {
      const ratio = done / habitCount;
      if (ratio >= 1) {
        cls = "hm-complete";
        title += " · complete";
      } else if (ratio > 0) {
        cls = "hm-partial";
        title += ` · ${done}/${habitCount}`;
      } else {
        cls = "hm-missed";
        title += " · missed";
      }
    }
    if (i === todayIdx) cls += " hm-today";
    cells.push(<div key={i} title={title} className={`hm-cell ${cls}`} />);
  }

  return (
    <div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: "repeat(26, minmax(0, 1fr))" }}>
        {cells}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-ink-soft">
        <Legend cls="hm-complete" label="Complete" />
        <Legend cls="hm-partial" label="Partial" />
        <Legend cls="hm-missed" label="Missed" />
        <Legend cls="hm-frozen" label="Frozen" />
        <span className="ml-auto tabular-nums text-ink-faint">
          {activeDays}/{totalDays} elapsed
        </span>
      </div>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 ${cls}`} />
      {label}
    </span>
  );
}
