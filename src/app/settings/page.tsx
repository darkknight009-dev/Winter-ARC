"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, BellRing, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { arcStartDate } from "@/lib/arc";
import { BottomNav } from "@/components/BottomNav";
import { PushSetup } from "@/components/PushSetup";

interface Profile {
  display_name: string;
  identity: string | null;
  commitment: string | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("display_name, identity, commitment")
        .eq("id", user.id)
        .single();
      if (data) setProfile(data);
    });
  }, []);

  async function save() {
    if (!profile) return;
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update(profile).eq("id", user.id);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/auth");
    router.refresh();
  }

  // Google Calendar template link: daily 9 PM reminder for the arc window.
  // Times are FLOATING (no Z suffix) so Google renders them in the user's
  // local timezone — 21:00 IST, not 21:00 UTC (= 2:30 AM IST).
  function googleCalendarUrl(): string {
    // arcStartDate() handles all three windows correctly: pre-arc (Sep)
    // returns the UPCOMING Oct 1; live arc returns its own Oct 1.
    const start = arcStartDate(new Date());
    const startY = start.getFullYear();
    const endY = startY + 1;
    const fmt = (yy: number, m: number, d: number) =>
      `${yy}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}T210000`;
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: "Winter Arc — Record the day ❄️",
      details:
        "60 seconds. Toggle habits, one honest line, seal the day. Streaks only survive if tonight decides.",
      dates: `${fmt(startY, 10, 1)}/${fmt(endY, 3, 1)}`,
      recur: `RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=${fmt(endY, 3, 1)}`,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  if (!profile) {
    return (
      <main className="mx-auto min-h-dvh w-full max-w-lg px-5 pb-32 pt-10">
        <p className="eyebrow">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-5 pb-32 pt-10">
      <header className="mb-8">
        <p className="eyebrow mb-2">Configuration</p>
        <h1 className="font-display text-5xl uppercase leading-none text-ink">The fine print</h1>
      </header>

      <div className="divider mb-8" />

      {/* Reminder — the loop's alarm clock */}
      <section className="card mb-4 p-6">
        <p className="eyebrow mb-1">Streak notifications</p>
        <p className="mb-4 text-sm text-ink-soft">
          Push notifications that hunt you down until the day is recorded. No emojis. No mercy.
        </p>
        <PushSetup />
      </section>

      <section className="card mb-8 p-6">
        <p className="eyebrow mb-1">Calendar backup</p>
        <p className="mb-4 text-sm text-ink-soft">
          Prefer a calendar entry over push? A 9:00 PM alarm, every day until the arc ends.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <a className="btn btn-ghost" href={googleCalendarUrl()} target="_blank" rel="noreferrer">
            <CalendarPlus size={16} /> Add to Google Calendar
          </a>
          <a className="btn btn-ghost" href="/api/arc-ics">
            <Download size={16} /> iPhone / Apple Calendar (.ics)
          </a>
        </div>
        <p className="mt-3 flex items-center gap-2 text-[11px] text-ink-faint">
          <BellRing size={12} /> Fires at 21:00 your device time, 30-minute heads-up included.
        </p>
      </section>

      <section className="card mb-8 space-y-6 p-6">
        <div>
          <label className="eyebrow mb-2 block">Name</label>
          <input
            className="input"
            value={profile.display_name}
            onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
            maxLength={40}
          />
        </div>
        <div>
          <label className="eyebrow mb-2 block">Feb 28 identity</label>
          <input
            className="input font-display text-xl uppercase"
            value={profile.identity ?? ""}
            onChange={(e) => setProfile({ ...profile, identity: e.target.value })}
            maxLength={120}
          />
        </div>
        <div>
          <label className="eyebrow mb-2 block">The promise</label>
          <textarea
            className="input min-h-24 resize-none"
            value={profile.commitment ?? ""}
            onChange={(e) => setProfile({ ...profile, commitment: e.target.value })}
            maxLength={400}
          />
        </div>
        <button className="btn btn-primary w-full" onClick={save} disabled={saving}>
          {saved ? "Amended" : saving ? "Recording…" : "Save changes"}
        </button>
      </section>

      <button className="btn btn-ghost w-full" onClick={signOut}>
        Sign out
      </button>

      <p className="mt-8 text-center text-[11px] leading-relaxed text-ink-faint">
        Habit changes mid-arc alter your ledger. Choose before Day 1, honor them after.
        Recorded days are sealed and cannot be undone.
      </p>

      <BottomNav />
    </main>
  );
}
