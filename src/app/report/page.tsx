import { getArcData } from "@/lib/data";
import {
  ARC_TOTAL_DAYS,
  arcStartDate,
  arcEndDate,
  dayIndexOf,
  isArcOver,
  levelFor,
  currentStreak,
  longestStreak,
  fmtDate,
} from "@/lib/arc";
import { BottomNav } from "@/components/BottomNav";
import { ShareButton } from "@/components/ShareButton";
import { EndSnapshotForm } from "@/components/EndSnapshotForm";

export const dynamic = "force-dynamic";

export default async function ReportPage() {
  const { profile, habits, checkins, freezes, snapshots } = await getArcData();

  const now = new Date();
  const todayIdx = dayIndexOf(now);
  const over = isArcOver(now);
  const daysSoFar = todayIdx < 0 ? 0 : Math.min(todayIdx + 1, ARC_TOTAL_DAYS);
  const completion = Math.round((daysSoFar / ARC_TOTAL_DAYS) * 100);

  const completedMap = new Map<number, number>();
  for (const c of checkins) completedMap.set(c.arc_day, c.habits_done.length);
  const frozenSet = new Set(freezes.map((f) => f.arc_day));

  const totalHabitChecks = checkins.reduce((s, c) => s + c.habits_done.length, 0);
  const perfectDays = [...completedMap.values()].filter((n) => n >= habits.length).length;
  const totalXp = checkins.reduce(
    (sum, c) => sum + c.habits_done.length * 10 + (c.habits_done.length === habits.length ? 10 : 0),
    0
  );
  const level = levelFor(totalXp);
  const streak = currentStreak(completedMap, frozenSet, habits.length, Math.max(todayIdx, 0));
  const longest = longestStreak(completedMap, frozenSet, habits.length, daysSoFar);

  const startSnap = snapshots.find((s) => s.kind === "start");
  const endSnap = snapshots.find((s) => s.kind === "end");
  const start = arcStartDate(now);
  const end = arcEndDate(now);

  const topJournals = checkins
    .filter((c) => c.journal)
    .sort((a, b) => b.arc_day - a.arc_day)
    .slice(0, 3);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-32 pt-8">
      <div className="readout mb-6">
        <span>
          DOSSIER <b>{profile.display_name.split(" ")[0].toUpperCase()}</b>
        </span>
        <span className={over ? "ember" : ""}>{over ? "ARC CLOSED" : "ARC LIVE"}</span>
        <span>
          DONE <b>{completion}%</b>
        </span>
      </div>

      <header className="mb-8">
        <p className="eyebrow mb-2">Transformation report</p>
        <h1 className="font-display text-5xl leading-none text-ink">
          THE 151-DAY RECORD
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {fmtDate(start)} → {fmtDate(end)}
        </p>
      </header>

      {/* Certificate */}
      <section className="card mb-6">
        <div className="border-b border-rule bg-sunken px-5 py-4">
          <p className="eyebrow mb-1">Subject</p>
          <p className="font-display text-3xl uppercase text-ink">{profile.display_name}</p>
          {profile.identity && (
            <p className="mt-1 text-sm italic text-ink-soft">“{profile.identity}”</p>
          )}
        </div>

        <div className="grid grid-cols-2">
          <Cell label="Days fought" value={String(daysSoFar)} />
          <Cell label="Habit checks" value={String(totalHabitChecks)} divider />
          <Cell label="Perfect days" value={String(perfectDays)} top />
          <Cell label="Longest streak" value={String(longest)} unit="d" top divider />
          <Cell label="Final level" value={`LV ${level.level}`} unit={level.title} />
          <Cell label="Arc completion" value={`${completion}%`} divider />
        </div>

        {startSnap?.weight != null && endSnap?.weight != null && (
          <div className="border-t border-rule px-5 py-5">
            <p className="eyebrow mb-1">Weight delta</p>
            <p className="numeral text-5xl text-ink">
              {endSnap.weight > startSnap.weight ? "+" : "−"}
              {Math.abs(endSnap.weight - startSnap.weight).toFixed(1)}
            </p>
          </div>
        )}

        {profile.commitment && (
          <div className="border-t border-rule px-5 py-5">
            <p className="eyebrow mb-2">The promise</p>
            <p className="text-base italic leading-snug text-ink">“{profile.commitment}”</p>
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <ShareButton />
        <a
          className="btn btn-ghost"
          href={`/api/report-card?u=${profile.id}`}
          download="winter-arc-report.png"
        >
          Save the card
        </a>
      </div>

      {/* The letter */}
      {startSnap?.note && (
        <section className="card mb-6 p-5">
          <p className="eyebrow mb-3">Transmission from Day 1</p>
          <p className="whitespace-pre-wrap text-lg leading-relaxed text-ink">{startSnap.note}</p>
          <p className="mt-4 text-[11px] text-ink-faint">
            Written {fmtDate(start)}. Answer honestly: did you become this person?
          </p>
        </section>
      )}

      {/* Seal */}
      {!endSnap && (
        <section className="card mb-6 p-5">
          <p className="eyebrow mb-2">Seal the arc</p>
          <p className="mb-4 text-sm text-ink-soft">
            {over
              ? "The 151 days are over. Record who you became."
              : "You may seal the record early — or wait for Day 151."}
          </p>
          <EndSnapshotForm />
        </section>
      )}

      {/* Lines worth keeping */}
      {topJournals.length > 0 && (
        <section className="card mb-6 p-5">
          <p className="eyebrow mb-4">Lines worth keeping</p>
          <div className="space-y-4">
            {topJournals.map((e) => (
              <blockquote key={e.arc_day} className="border-l-2 border-glacier pl-3">
                <p className="text-base text-ink">{e.journal}</p>
                <footer className="eyebrow mt-1">Day {e.arc_day + 1}</footer>
              </blockquote>
            ))}
          </div>
        </section>
      )}

      <BottomNav />
    </main>
  );
}

function Cell({
  label,
  value,
  unit,
  divider,
  top,
}: {
  label: string;
  value: string;
  unit?: string;
  divider?: boolean;
  top?: boolean;
}) {
  return (
    <div
      className={`px-5 py-4 ${divider ? "border-l border-rule" : ""} ${top ? "border-t border-rule" : ""}`}
    >
      <p className="eyebrow mb-1">{label}</p>
      <p className="numeral text-3xl text-ink">
        {value}
        {unit && <span className="ml-1.5 text-xs font-sans text-ink-faint">{unit}</span>}
      </p>
    </div>
  );
}
