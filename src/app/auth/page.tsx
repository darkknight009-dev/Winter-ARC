"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AuthPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) setError(`Google sign-in failed: ${err.replace(/_/g, " ")}`);
  }, []);

  async function signInWithGoogle() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-16">
      {/* Wordmark */}
      <div className="mb-10">
        <div className="mb-4 h-[3px] w-14 bg-ember" />
        <p className="eyebrow mb-3">October 1 → February 28 · 151 days</p>
        <h1 className="font-display text-6xl leading-[0.95] text-ink">
          Winter
          <br />
          Arc
        </h1>
        <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-soft">
          The discipline operating system. Check in daily. Defend the streak. Finish with proof.
        </p>
      </div>

      <div className="divider mb-10" />

      {/* Terms of entry */}
      <ul className="mb-10 space-y-3">
        {[
          "Choose who you are on Feb 28 — then become it.",
          "Three non-negotiables. Logged daily. No negotiation.",
          "A Day-1 snapshot, sealed until the final report.",
        ].map((line) => (
          <li key={line} className="flex gap-3 text-sm leading-relaxed text-ink-soft">
            <span className="mt-[7px] h-1 w-1 flex-shrink-0 bg-glacier" />
            {line}
          </li>
        ))}
      </ul>

      <button
        onClick={signInWithGoogle}
        disabled={loading}
        className="btn btn-primary w-full py-4 text-base"
      >
        {loading ? "Opening Google…" : "Enter with Google"}
      </button>

      {error && <p className="mt-4 text-center text-sm text-fail">{error}</p>}

      <p className="mt-8 text-center font-display text-xs uppercase tracking-[0.2em] text-ink-faint">
        One account · One arc · No excuses
      </p>
    </main>
  );
}
