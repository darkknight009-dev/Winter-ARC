"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Flame, Crosshair, Minus, BatteryLow, BatteryMedium, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface HabitLite {
  id: string;
  label: string;
  icon: string;
}

interface Props {
  habits: HabitLite[];
  todayCheckin: { habits_done: string[]; mood: string | null; journal: string | null } | null;
  arcYear: number;
  arcDay: number;
  dateStr: string;
  preArc: boolean;
  freezesUsed: number;
  isComplete: boolean;
  /** Streak entering today — used for milestone celebration logic. */
  streakHint?: number;
}

/**
 * Condition readout — instrument gauges, not emojis.
 * key maps to the DB `mood` value (kept stable for old rows).
 */
const CONDITIONS = [
  { key: "wrecked", icon: BatteryLow, label: "Wrecked" },
  { key: "low", icon: BatteryMedium, label: "Low" },
  { key: "neutral", icon: Minus, label: "Neutral" },
  { key: "sharp", icon: Crosshair, label: "Sharp" },
  { key: "fire", icon: Flame, label: "On fire" },
] as const;

const LEGACY_EMOJI_MAP: Record<string, string> = {
  "😫": "wrecked",
  "😕": "low",
  "😐": "neutral",
  "🙂": "sharp",
  "🔥": "fire",
};

function moodToKey(mood: string | null): string | null {
  if (!mood) return null;
  return LEGACY_EMOJI_MAP[mood] ?? mood;
}

export function CheckinClient({
  habits,
  todayCheckin,
  arcYear,
  arcDay,
  dateStr,
  preArc,
  freezesUsed,
  isComplete,
  streakHint = 0,
}: Props) {
  const router = useRouter();
  const sealed = isComplete; // once the day is fully recorded, it cannot be changed
  const [selected, setSelected] = useState<Set<string>>(new Set(todayCheckin?.habits_done ?? []));
  const [mood, setMood] = useState<string | null>(moodToKey(todayCheckin?.mood ?? null));
  const [journal, setJournal] = useState(todayCheckin?.journal ?? "");
  const [saving, setSaving] = useState(false);
  const [recorded, setRecorded] = useState(sealed);
  const [error, setError] = useState<string | null>(null);
  const [usedFreeze, setUsedFreeze] = useState(false);

  const complete = selected.size >= habits.length && habits.length > 0;

  function toggle(id: string) {
    if (sealed) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (sealed) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { error } = await supabase.from("checkins").upsert(
        {
          user_id: user.id,
          arc_year: arcYear,
          arc_day: arcDay,
          date: dateStr,
          habits_done: [...selected],
          mood,
          journal: journal || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,arc_year,arc_day" }
      );
      if (error) throw error;

      if (complete) {
        setRecorded(true);
        // Fire-and-forget: celebrate the milestone, log the completion so the        // evening ladder stays silent (cron checks push_log before nagging).
        void fetch("/api/push/celebrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ arcYear, arcDay, streakAfter: streakHint }),
        }).catch(() => {});
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function useFreeze() {
    if (sealed) return;
    setError(null);
    if (freezesUsed >= 3) {
      setError("No freezes left. The cold doesn't care.");
      return;
    }
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { error } = await supabase.from("freezes").upsert(
        { user_id: user.id, arc_year: arcYear, arc_day: arcDay, date: dateStr },
        { onConflict: "user_id,arc_year,arc_day" }
      );
      if (error) throw error;
      setUsedFreeze(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Freeze failed");
    }
  }

  if (preArc) {
    return (
      <section className="card p-6 text-center">
        <p className="eyebrow mb-2">Training ground</p>
        <p className="font-display text-3xl text-ink">The arc has not begun.</p>
        <p className="mx-auto mt-2 max-w-xs text-sm text-ink-soft">
          Rehearse now. The ledger opens Day 1 — arrive warm while everyone else arrives cold.
        </p>
      </section>
    );
  }

  // SEALED state — the day is on the record. Read-only.
  if (sealed) {
    const condition = CONDITIONS.find((c) => c.key === mood);
    return (
      <section className="card p-5 border-verified">
        <div className="mb-5 flex items-center justify-between">
          <p className="eyebrow">Today&apos;s attendance</p>
          <span className="stamp">✓ Recorded</span>
        </div>

        <div className="space-y-2">
          {habits.map((h) => {
            const done = selected.has(h.id);
            return (
              <div key={h.id} className="habit-row" data-done={done} aria-disabled>
                <span className="checkbox">{done && <Check size={14} strokeWidth={3.5} />}</span>
                <span className="flex-1 font-display text-2xl uppercase text-ink">{h.label}</span>
                <span className="eyebrow">{done ? "LOGGED" : "SKIPPED"}</span>
              </div>
            );
          })}
        </div>

        {condition && (
          <div className="mt-5 flex items-center gap-2 border border-rule px-4 py-3">
            <condition.icon size={18} className="text-glacier" />
            <span className="eyebrow">Condition · {condition.label}</span>
          </div>
        )}

        {journal && (
          <div className="mt-4 border-l-2 border-glacier pl-3">
            <p className="eyebrow mb-1">Log line</p>
            <p className="text-sm text-ink">{journal}</p>
          </div>
        )}

        <p className="mt-5 flex items-center justify-center gap-2 border-t border-rule pt-4 text-center text-xs text-ink-faint">
          <Lock size={12} />
          The day is sealed. What&apos;s on the record stays on the record.
        </p>
      </section>
    );
  }

  // ACTIVE state — today is still open.
  return (
    <section className="card p-5">
      <div className="mb-5 flex items-center justify-between">
        <p className="eyebrow">Today&apos;s attendance</p>
        {recorded && <span className="stamp">✓ Recorded</span>}
      </div>

      <div className="space-y-2">
        {habits.map((h) => {
          const done = selected.has(h.id);
          return (
            <button key={h.id} onClick={() => toggle(h.id)} className="habit-row" data-done={done}>
              <span className="checkbox">{done && <Check size={14} strokeWidth={3.5} />}</span>
              <span className="flex-1 font-display text-2xl uppercase text-ink">{h.label}</span>
              <span className="eyebrow">{done ? "LOGGED" : ""}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <p className="eyebrow mb-2">Condition</p>
        <div className="grid grid-cols-5 gap-2">
          {CONDITIONS.map((c) => {
            const active = mood === c.key;
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                onClick={() => setMood(active ? null : c.key)}
                className={`flex flex-col items-center gap-1.5 border px-1 py-3 transition-colors ${
                  active ? "border-ink bg-sunken" : "border-rule hover:border-rule-strong"
                }`}
                aria-pressed={active}
                aria-label={c.label}
              >
                <Icon size={20} className={active ? "text-ember" : "text-ink-soft"} />
                <span className={`text-[9px] font-semibold uppercase tracking-widest ${active ? "text-ink" : "text-ink-faint"}`}>
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <p className="eyebrow mb-2">Log line</p>
        <input
          className="input"
          value={journal}
          onChange={(e) => setJournal(e.target.value)}
          placeholder="One honest line about today…"
          maxLength={280}
        />
      </div>

      {error && <p className="mt-4 text-sm text-fail">{error}</p>}

      <button onClick={save} disabled={saving || arcDay < 0} className="btn btn-primary mt-6 w-full">
        {saving ? "Recording…" : complete ? "Record the day" : "Save check-in"}
      </button>
      {complete && (
        <p className="mt-3 text-center text-[11px] text-ink-faint">
          Recording seals today permanently. Choose honestly.
        </p>
      )}

      {!isComplete && !usedFreeze && freezesUsed < 3 && (
        <button onClick={useFreeze} className="btn btn-ghost mt-3 w-full">
          Use a freeze · {3 - freezesUsed} remaining
        </button>
      )}
    </section>
  );
}
