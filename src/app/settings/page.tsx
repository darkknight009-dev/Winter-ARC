"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, BellRing, Download, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { arcStartDate } from "@/lib/arc";
import { BottomNav } from "@/components/BottomNav";

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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  async function deleteAllData() {
    if (deleteConfirmation !== "DELETE") return;
    setDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch("/api/account/delete-data", { method: "POST" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Data deletion failed");

      // The auth identity remains, so the user can immediately configure a new arc.
      router.replace("/onboarding");
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Data deletion failed");
      setDeleting(false);
    }
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
      <section className="card mb-8 p-6">
        <p className="eyebrow mb-1">Daily reminder</p>
        <p className="mb-4 text-sm text-ink-soft">
          A 9:00 PM check-in alarm, every day until the arc ends. Miss it and the streak bleeds.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <a className="btn btn-accent" href={googleCalendarUrl()} target="_blank" rel="noreferrer">
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

      <section className="card mt-8 border-fail p-6">
        <p className="eyebrow mb-2 text-fail">Danger zone</p>
        <h2 className="font-display text-3xl uppercase text-ink">Erase the record</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Permanently delete your profile, habits, check-ins, freezes, snapshots, and progress
          photos. Your sign-in account stays active so you can start a new arc. This cannot be
          undone.
        </p>

        {!confirmingDelete ? (
          <button
            className="btn btn-ghost mt-5 w-full border-fail text-fail"
            onClick={() => {
              setConfirmingDelete(true);
              setDeleteError(null);
            }}
          >
            <Trash2 size={16} /> Delete all app data
          </button>
        ) : (
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void deleteAllData();
            }}
          >
            <div>
              <label className="eyebrow mb-2 block" htmlFor="delete-confirmation">
                Type DELETE to confirm
              </label>
              <input
                id="delete-confirmation"
                className="input"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                autoComplete="off"
                autoFocus
                spellCheck={false}
              />
            </div>
            {deleteError && (
              <p className="text-sm text-fail" role="alert">
                {deleteError}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setConfirmingDelete(false);
                  setDeleteConfirmation("");
                  setDeleteError(null);
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-accent"
                disabled={deleting || deleteConfirmation !== "DELETE"}
              >
                {deleting ? "Erasing…" : "Erase everything"}
              </button>
            </div>
          </form>
        )}
      </section>

      <p className="mt-8 text-center text-[11px] leading-relaxed text-ink-faint">
        Habit changes mid-arc alter your ledger. Choose before Day 1, honor them after.
        Recorded days are sealed and cannot be undone.
      </p>

      <BottomNav />
    </main>
  );
}
