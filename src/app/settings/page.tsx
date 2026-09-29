"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
      </p>

      <BottomNav />
    </main>
  );
}
