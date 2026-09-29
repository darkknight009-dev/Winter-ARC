import { getArcData } from "@/lib/data";
import {
  ARC_TOTAL_DAYS,
  dayIndexOf,
  levelFor,
  currentStreak,
  longestStreak,
  fmtDate,
  arcStartDate,
  zonedNow,
} from "@/lib/arc";
import { Heatmap } from "@/components/Heatmap";
import { BottomNav } from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const { profile, habits, checkins, freezes, snapshots } = await getArcData();

  const now = zonedNow(profile.timezone);
  const todayIdx = dayIndexOf(now);

  const completedMap = new Map<number, number>();
  for (const c of checkins) completedMap.set(c.arc_day, c.habits_done.length);
  const frozenSet = new Set(freezes.map((f) => f.arc_day));

  const totalXp = checkins.reduce(
    (sum, c) => sum + c.habits_done.length * 10 + (c.habits_done.length === habits.length ? 10 : 0),
    0
  );
  const level = levelFor(totalXp);
  const streak = currentStreak(completedMap, frozenSet, habits.length, Math.max(todayIdx, 0));
  const daysSoFar = todayIdx < 0 ? 0 : Math.min(todayIdx + 1, ARC_TOTAL_DAYS);
  const longest = longestStreak(completedMap, frozenSet, habits.length, daysSoFar);

  const perfectDays = [...completedMap.values()].filter((n) => n >= habits.length).length;
  const totalHabitChecks = checkins.reduce((s, c) => s + c.habits_done.length, 0);

  const startSnapshot = snapshots.find((s) => s.kind === "start");
  const endSnapshot = snapshots.find((s) => s.kind === "end");
  const start = arcStartDate(now);

  const weekEntries = checkins
    .filter((c) => c.arc_day >= todayIdx - 6 && c.arc_day <= todayIdx && (c.journal || c.mood))
    .sort((a, b) => b.arc_day - a.arc_day);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-32 pt-8">
      {/* Readout strip */}
      <div className="readout mb-6">
        <span>
          SUBJECT <b>{profile.display_name.split(" ")[0].toUpperCase()}</b>
        </span>
        <span>
          LEVEL <b>{level.level}</b>
        </span>
        <span>
          XP <b>{totalXp}</b>
        </span>
      </div>

      <header className="mb-8">
        <p className="eyebrow mb-2">The record</p>
        <h1 className="font-display text-5xl leading-none text-ink">PERFORMANCE DATA</h1>
      </header>

      {/* Stat blocks — 2x2 instrument grid */}
      <section className="mb-6 grid grid-cols-2 border border-rule">
        <Stat label="Current streak" value={streak} unit="days" ember={streak >= 3} />
        <Stat label="Longest streak" value={longest} unit="days" divider />
        <Stat label="Perfect days" value={perfectDays} unit={`of ${daysSoFar}`} top />
        <Stat label="Habit checks" value={totalHabitChecks} unit="logged" top divider />
      </section>

      {/* Ascension */}
      <section className="mb-6">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="eyebrow">Ascension</p>
          <p className="numeral text-xs text-ink-faint">
            {level.xpIntoLevel}/{level.xpForNext} XP → LV {level.level + 1}
          </p>
        </div>
        <div className="h-[4px] w-full bg-sunken border border-rule">
          <div
            className="h-full bg-glacier"
            style={{ width: `${Math.round(level.progress * 100)}%` }}
          />
        </div>
      </section>

      {/* Heatmap */}
      <section className="card mb-6 p-5">
        <p className="eyebrow mb-4">The 151 days</p>
        <Heatmap
          totalDays={ARC_TOTAL_DAYS}
          todayIdx={todayIdx}
          completedMap={completedMap}
          frozenSet={frozenSet}
          habitCount={habits.length}
        />
      </section>

      {/* Evidence */}
      <section className="mb-6">
        <p className="eyebrow mb-3">Evidence</p>
        <div className="grid grid-cols-2 gap-3">
          <SnapshotCard
            title="Day 1"
            date={fmtDate(start)}
            photoUrl={startSnapshot?.photo_url ?? null}
            weight={startSnapshot?.weight ?? null}
            note={startSnapshot?.note ?? null}
          />
          <SnapshotCard
            title="Day 151"
            date={endSnapshot ? fmtDate(new Date()) : "Feb 28"}
            photoUrl={endSnapshot?.photo_url ?? null}
            weight={endSnapshot?.weight ?? null}
            note={endSnapshot?.note ?? null}
          />
        </div>
        {startSnapshot?.weight != null && endSnapshot?.weight != null && (
          <div className="readout mt-3">
            <span>WEIGHT DELTA</span>
            <span>
              <b className="numeral text-base">
                {endSnap_weight(startSnapshot.weight, endSnapshot.weight)}
              </b>
            </span>
          </div>
        )}
      </section>

      {/* Weekly log */}
      <section className="card mb-6 p-5">
        <p className="eyebrow mb-4">Log lines · last 7 days</p>
        {weekEntries.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Nothing written yet. One honest line a day becomes a mirror by February.
          </p>
        ) : (
          <div className="space-y-4">
            {weekEntries.map((e) => (
              <div key={e.arc_day} className="border-l-2 border-glacier pl-3">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">Day {e.arc_day + 1}</span>
                  <span className="text-[11px] text-ink-faint">
                    {e.mood} {e.habits_done.length}/{habits.length}
                  </span>
                </div>
                {e.journal && <p className="mt-1 text-sm text-ink">{e.journal}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <BottomNav />
    </main>
  );
}

function endSnap_weight(a: number, b: number) {
  const d = (b - a).toFixed(1);
  return b >= a ? `+${d}` : d;
}

function Stat({
  label,
  value,
  unit,
  ember,
  divider,
  top,
}: {
  label: string;
  value: number | string;
  unit?: string;
  ember?: boolean;
  divider?: boolean;
  top?: boolean;
}) {
  return (
    <div
      className={`px-4 py-5 ${divider ? "border-l border-rule" : ""} ${top ? "border-t border-rule" : ""}`}
    >
      <p className="eyebrow mb-2">{label}</p>
      <p className="numeral text-5xl">
        <span className={ember ? "text-ember" : "text-ink"}>{value}</span>
        {unit && <span className="ml-1 text-xs font-sans text-ink-faint">{unit}</span>}
      </p>
    </div>
  );
}

function SnapshotCard({
  title,
  date,
  photoUrl,
  weight,
  note,
}: {
  title: string;
  date: string;
  photoUrl: string | null;
  weight: number | null;
  note: string | null;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-baseline justify-between px-4 pt-3">
        <p className="eyebrow">{title}</p>
        <p className="text-[11px] text-ink-faint">{date}</p>
      </div>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={title}
          className="mx-4 mt-2 aspect-[3/4] w-[calc(100%-2rem)] object-cover grayscale transition-all duration-300 hover:grayscale-0"
        />
      ) : (
        <div className="mx-4 mt-2 flex aspect-[3/4] w-[calc(100%-2rem)] items-center justify-center border border-dashed border-rule-strong">
          <span className="font-display text-xl uppercase text-ink-ghost">
            {title === "Day 151" ? "Awaited" : "Sealed"}
          </span>
        </div>
      )}
      {weight != null && (
        <p className="px-4 py-2 text-sm text-ink-soft">
          <span className="numeral text-lg text-ink">{weight}</span> recorded
        </p>
      )}
      {note && <p className="line-clamp-3 px-4 pb-4 text-sm text-ink-soft">{note}</p>}
      {!note && !weight && photoUrl && <div className="pb-4" />}
    </div>
  );
}
