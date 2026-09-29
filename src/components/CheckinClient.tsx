"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
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
}

const MOODS = ["😫", "😕", "😐", "🙂", "🔥"];

export function CheckinClient({
  habits,
  todayCheckin,
  arcYear,
  arcDay,
  dateStr,
  preArc,
  freezesUsed,
  isComplete,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(todayCheckin?.habits_done ?? []));
  const [mood, setMood] = useState<string | null>(todayCheckin?.mood ?? null);
  const [journal, setJournal] = useState(todayCheckin?.journal ?? "");
  const [saving, setSaving] = useState(false);
  const [recorded, setRecorded] = useState(isComplete);
  const [error, setError] = useState<string | null>(null);
  const [usedFreeze, setUsedFreeze] = useState(false);

  const complete = selected.size >= habits.length && habits.length > 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
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

      if (complete) setRecorded(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function useFreeze() {
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
        <div className="flex gap-2">
          {MOODS.map((m, i) => (
            <button
              key={m}
              onClick={() => setMood(mood === m ? null : m)}
              className={`flex h-11 w-11 items-center justify-center border text-lg transition-colors ${
                mood === m ? "border-ink bg-sunken" : "border-rule hover:border-rule-strong"
              }`}
              aria-label={`Mood ${i + 1}`}
            >
              {m}
            </button>
          ))}
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

      {!isComplete && !usedFreeze && freezesUsed < 3 && (
        <button onClick={useFreeze} className="btn btn-ghost mt-3 w-full">
          Use a freeze · {3 - freezesUsed} remaining
        </button>
      )}
    </section>
  );
}
