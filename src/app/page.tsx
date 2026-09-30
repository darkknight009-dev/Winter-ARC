import Link from "next/link";
import { getArcData } from "@/lib/data";
import {
  ARC_TOTAL_DAYS,
  arcStartDate,
  arcEndDate,
  dayIndexOf,
  daysRemaining,
  chapterProgress,
  levelFor,
  currentStreak,
  fmtDate,
  zonedNow,
} from "@/lib/arc";
import { CheckinClient } from "@/components/CheckinClient";
import { StreakBeacon } from "@/components/StreakBeacon";
import { BottomNav } from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { profile, habits, checkins, freezes } = await getArcData();

  const now = zonedNow(profile.timezone);
  const todayIdx = dayIndexOf(now);
  const start = arcStartDate(now);
  const end = arcEndDate(now);
  const left = daysRemaining(now);

  const completedMap = new Map<number, number>();
  for (const c of checkins) completedMap.set(c.arc_day, c.habits_done.length);
  const frozenSet = new Set(freezes.map((f) => f.arc_day));

  const streak = currentStreak(completedMap, frozenSet, habits.length, Math.max(todayIdx, 0));
  const totalXp = checkins.reduce(
    (sum, c) => sum + c.habits_done.length * 10 + (c.habits_done.length === habits.length ? 10 : 0),
    0
  );
  const level = levelFor(totalXp);
  const { chapter, progress } = chapterProgress(now);

  const todayCheckin = checkins.find((c) => c.arc_day === todayIdx);
  const dayNum = todayIdx + 1;
  const preArc = todayIdx < 0;
  const doneCount = todayCheckin?.habits_done.length ?? 0;
  const atRisk = !preArc && doneCount < habits.length;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-32 pt-8">
      {/* Status line */}
      <div className="readout mb-6">
        <span>
          ARC <b>{preArc ? "PRE" : "LIVE"}</b>
        </span>
        <span className={atRisk ? "ember" : ""}>
          {atRisk ? "TODAY UNRECORDED" : "TODAY LOCKED"}
        </span>
        <span>
          XP <b>{totalXp}</b>
        </span>
      </div>

      {/* Hero counter */}
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p className="eyebrow mb-2">
            {preArc ? `The arc begins ${fmtDate(start)}` : "Days remaining"}
          </p>
          <h1 className="numeral text-8xl text-ink">{preArc ? 0 : left}</h1>
        </div>
        <div className="text-right">
          <p className="eyebrow mb-2">Day</p>
          <p className="numeral text-4xl text-ink-faint">
            {preArc ? "—" : `${dayNum}/${ARC_TOTAL_DAYS}`}
          </p>
          <Link href="/settings" className="eyebrow mt-3 inline-block text-ink-soft underline underline-offset-4">
            Config
          </Link>
        </div>
      </header>

      {/* Streak beacon — the loop */}
      <StreakBeacon streak={streak} doneToday={doneCount >= habits.length} preArc={preArc} />

      {/* Ledger */}
      <section className="mb-6">
        <p className="eyebrow mb-3">The ledger</p>
        <div className="card px-5 py-2">
          <LedgerRow label="Level" value={`LV ${level.level} · ${level.title.toUpperCase()}`} />
          <LedgerRow label="Total XP" value={String(totalXp)} />
          <LedgerRow label="Freezes left" value={`${3 - frozenSet.size}/3`} last />
        </div>
      </section>

      {/* Ascension bar */}
      <section className="mb-6">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="eyebrow">Ascension</p>
          <p className="numeral text-xs text-ink-faint">
            {level.xpIntoLevel}/{level.xpForNext} XP → LV {level.level + 1}
          </p>
        </div>
        <div className="h-[4px] w-full bg-sunken border border-rule">
          <div
            className="h-full bg-glacier transition-all"
            style={{ width: `${Math.round(level.progress * 100)}%` }}
          />
        </div>
      </section>

      {/* Chapter module */}
      <section className="card mb-6 p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="eyebrow">
            Chapter {chapter.id} · {chapter.name}
          </p>
          <span className="tag">{Math.round(progress * 100)}%</span>
        </div>
        <p className="font-display text-2xl leading-tight text-ink">{chapter.blurb}</p>
        <div className="mt-4 h-[4px] w-full bg-sunken border border-rule">
          <div className="h-full bg-glacier" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </section>

      {/* Check-in */}
      <CheckinClient
        habits={habits.map((h) => ({ id: h.id, label: h.label, icon: h.icon }))}
        todayCheckin={
          todayCheckin
            ? { habits_done: todayCheckin.habits_done, mood: todayCheckin.mood, journal: todayCheckin.journal }
            : null
        }
        arcYear={start.getFullYear()}
        arcDay={todayIdx}
        dateStr={now.toISOString().slice(0, 10)}
        preArc={preArc}
        freezesUsed={frozenSet.size}
        isComplete={doneCount >= habits.length}
        streakHint={streak}
      />

      <BottomNav />
    </main>
  );
}

function LedgerRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-baseline py-3 ${last ? "" : "border-b border-rule"}`}>
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="leader" />
      <span className="numeral text-lg text-ink">{value}</span>
    </div>
  );
}
