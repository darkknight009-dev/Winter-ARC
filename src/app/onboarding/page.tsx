"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const SUGGESTED_HABITS = [
  { icon: "🏋️", label: "Workout" },
  { icon: "📖", label: "Read 10 pages" },
  { icon: "🧘", label: "Meditate 10 min" },
  { icon: "💧", label: "3L water" },
  { icon: "💻", label: "Deep work 1h" },
  { icon: "🌙", label: "Sleep by 11pm" },
  { icon: "🚶", label: "10k steps" },
  { icon: "🥗", label: "Eat clean" },
  { icon: "✍️", label: "Journal" },
  { icon: "🚫", label: "No doomscroll" },
];

const STEP_TITLES = ["IDENTITY", "TERMS", "THE PACT"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [identity, setIdentity] = useState("");
  const [commitment, setCommitment] = useState("");
  const [habits, setHabits] = useState<{ icon: string; label: string }[]>([]);
  const [custom, setCustom] = useState("");
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleHabit(h: { icon: string; label: string }) {
    setHabits((prev) => {
      const exists = prev.some((x) => x.label === h.label);
      if (exists) return prev.filter((x) => x.label !== h.label);
      if (prev.length >= 3) return prev;
      return [...prev, h];
    });
  }

  function onPhotoChange(f: File | null) {
    setPhoto(f);
    setPhotoPreview(f ? URL.createObjectURL(f) : null);
  }

  async function finish() {
    setError(null);
    if (habits.length === 0) {
      setError("Pick at least one habit — non-negotiables only.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

      const { error: pErr } = await supabase
        .from("profiles")
        .upsert({ id: user.id, identity: identity || null, commitment: commitment || null, timezone });
      if (pErr) throw pErr;

      const { error: hErr } = await supabase.from("habits").insert(
        habits.map((h, i) => ({ user_id: user.id, label: h.label, icon: h.icon, sort_order: i }))
      );
      if (hErr) throw hErr;

      let photoUrl: string | null = null;
      if (photo) {
        const ext = photo.name.split(".").pop() || "jpg";
        const path = `${user.id}/start.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("progress-photos")
          .upload(path, photo, { upsert: true });
        if (!upErr) {
          const { data } = supabase.storage.from("progress-photos").getPublicUrl(path);
          photoUrl = data.publicUrl;
        }
      }

      const { error: sErr } = await supabase.from("snapshots").upsert({
        user_id: user.id,
        kind: "start",
        weight: weight ? Number(weight) : null,
        note: note || null,
        photo_url: photoUrl,
      });
      if (sErr) throw sErr;

      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-5 pb-16 pt-8">
      {/* Protocol header */}
      <div className="readout mb-8">
        <span>
          STEP <b>{step + 1}/3</b>
        </span>
        <span>
          <b>{STEP_TITLES[step]}</b>
        </span>
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-2 w-2 ${i <= step ? "bg-ember" : "bg-rule-strong"}`} />
          ))}
        </span>
      </div>

      {step === 0 && (
        <section>
          <h1 className="font-display text-5xl leading-[0.95] text-ink">
            Who are you on
            <br />
            Feb 28?
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            Not a goal. An identity — written like it already happened. This line hangs over every
            check-in for 151 days.
          </p>
          <input
            className="input mt-8 font-display text-2xl uppercase"
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            placeholder="DISCIPLINED. SHARPENED. GONE."
            maxLength={120}
          />
          <label className="eyebrow mt-8 mb-2 block">The promise · why it matters</label>
          <textarea
            className="input min-h-28 resize-none"
            value={commitment}
            onChange={(e) => setCommitment(e.target.value)}
            placeholder="Your promise to yourself. You'll reread this on the days you want to quit."
            maxLength={400}
          />
          <button className="btn btn-primary mt-10 w-full" onClick={() => setStep(1)}>
            Continue to terms
          </button>
        </section>
      )}

      {step === 1 && (
        <section>
          <h1 className="font-display text-5xl leading-[0.95] text-ink">
            The terms.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            Maximum three non-negotiables. Choose what you can do on your worst day — that's the
            only standard that survives 151 of them.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {SUGGESTED_HABITS.map((h) => {
              const selected = habits.some((x) => x.label === h.label);
              return (
                <button
                  key={h.label}
                  type="button"
                  onClick={() => toggleHabit(h)}
                  className={`border px-3.5 py-2 font-display text-sm uppercase tracking-wide transition-colors ${
                    selected
                      ? "border-ink bg-ink text-paper"
                      : "border-rule-strong text-ink-soft hover:border-ink hover:text-ink"
                  }`}
                >
                  {h.icon} {h.label}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex gap-2">
            <input
              className="input"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Or draft your own…"
              maxLength={40}
            />
            <button
              type="button"
              className="btn btn-ghost shrink-0"
              onClick={() => {
                if (custom.trim() && habits.length < 3) {
                  setHabits((prev) => [...prev, { icon: "🎯", label: custom.trim() }]);
                  setCustom("");
                }
              }}
            >
              Draft
            </button>
          </div>
          <p className="eyebrow mt-4">{habits.length}/3 terms accepted</p>
          <div className="mt-10 flex gap-3">
            <button className="btn btn-ghost flex-1" onClick={() => setStep(0)}>
              Back
            </button>
            <button className="btn btn-primary flex-1" onClick={() => setStep(2)}>
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1 className="font-display text-5xl leading-[0.95] text-ink">The pact.</h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            Capture Day 1 so February 28 has something to answer to. Sealed and unread until the
            final report.
          </p>

          <label className="eyebrow mt-8 mb-2 block">Weight · optional</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="kg or lb — your call"
          />

          <label className="eyebrow mt-6 mb-2 block">Photograph · optional</label>
          {photoPreview ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt="Day 1"
                className="h-24 w-24 object-cover grayscale"
              />
              <button className="btn btn-ghost" onClick={() => onPhotoChange(null)}>
                Remove
              </button>
            </div>
          ) : (
            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={(e) => onPhotoChange(e.target.files?.[0] ?? null)}
            />
          )}

          <label className="eyebrow mt-6 mb-2 block">Letter to your Feb-28 self</label>
          <textarea
            className="input min-h-32 resize-none"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Dear future me — by February 28, I will have…"
            maxLength={1000}
          />

          {error && <p className="mt-4 text-sm text-fail">{error}</p>}

          <div className="mt-10 flex gap-3">
            <button className="btn btn-ghost flex-1" onClick={() => setStep(1)} disabled={saving}>
              Back
            </button>
            <button className="btn btn-primary flex-1" onClick={finish} disabled={saving}>
              {saving ? "Sealing…" : "Seal the pact"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
