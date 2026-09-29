"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface Props {
  streak: number;
  doneToday: boolean;
  preArc: boolean;
}

const MILESTONES = [7, 30, 75, 151];

/**
 * The retention loop, instrument-grade: a streak you can lose today.
 * Ember when at risk, ice when standing, next milestone always visible.
 */
export function StreakBeacon({ streak, doneToday, preArc }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (preArc || doneToday) return;
    if (new Date().getHours() >= 18) {
      const t = setTimeout(() => router.refresh(), 1500);
      return () => clearTimeout(t);
    }
  }, [preArc, doneToday, router]);

  const next = MILESTONES.find((m) => m > streak) ?? MILESTONES[MILESTONES.length - 1];
  const atRisk = !doneToday && !preArc;

  return (
    <section className={`card mb-6 p-5 ${atRisk ? "border-ember" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`eyebrow mb-1 ${atRisk ? "text-ember at-risk" : ""}`}>
            {preArc
              ? "Streaks begin Day 1"
              : atRisk
                ? "Streak at risk — today unrecorded"
                : "Streak standing"}
          </p>
          <p className="numeral text-6xl">
            <span className={atRisk ? "text-ember" : "text-ink"}>{streak}</span>
            <span className="ml-2 text-sm font-sans tracking-wide text-ink-faint">DAYS</span>
          </p>
        </div>

        <div className="milestone" data-locked={streak < next}>
          <span className="coin">{next}</span>
          <span className="eyebrow">{next - streak} to go</span>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-rule pt-4">
        {MILESTONES.map((m) => (
          <div key={m} className="milestone" data-locked={streak < m}>
            <span className="coin" style={{ width: 30, height: 30, fontSize: 11 }}>
              {m <= streak ? "✓" : m}
            </span>
          </div>
        ))}
      </div>

      {atRisk && (
        <p className="mt-4 border-t border-rule pt-3 text-center font-display text-lg text-ember">
          One check-in keeps it alive. Tonight decides.
        </p>
      )}
    </section>
  );
}
