"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const WORDS = [
  "LOCKING IN…",
  "OPENING THE LEDGER…",
  "COUNTING THE DAYS…",
  "FORGING THE IRON…",
  "SEALING THE RECORD…",
];

/**
 * Freeze transition — the Winter Arc page loader.
 * On navigation: the screen freezes over (near-black overlay), an ice
 * snowflake draws itself stroke-by-stroke while slowly rotating, and
 * a Midnight Discipline status line cycles underneath. On-brand, fast,
 * and gone the instant content arrives.
 */
export function FreezeLoader() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"idle" | "run">("idle");
  const [word, setWord] = useState(WORDS[0]);

  useEffect(() => {
    // Any route change triggers one freeze sequence.
    setWord(WORDS[Math.floor(Math.random() * WORDS.length)]);
    setPhase("run");
    const t = setTimeout(() => setPhase("idle"), 900);
    return () => clearTimeout(t);
  }, [pathname]);

  if (phase === "idle") return null;

  return (
    <div className="freeze-overlay" aria-hidden>
      <div className="freeze-core">
        <svg viewBox="0 0 100 100" className="freeze-flake">
          {/* 6 arms + branches, drawn in sequence */}
          <g className="flake-arm">
            <line x1="50" y1="50" x2="50" y2="8" />
            <line x1="50" y1="21" x2="40" y2="12" />
            <line x1="50" y1="21" x2="60" y2="12" />
          </g>
          <g className="flake-arm" style={{ animationDelay: "0.08s" }}>
            <line x1="50" y1="50" x2="82" y2="29" />
            <line x1="71" y1="35" x2="70" y2="22" />
            <line x1="71" y1="35" x2="83" y2="40" />
          </g>
          <g className="flake-arm" style={{ animationDelay: "0.16s" }}>
            <line x1="50" y1="50" x2="82" y2="71" />
            <line x1="71" y1="65" x2="83" y2="60" />
            <line x1="71" y1="65" x2="70" y2="78" />
          </g>
          <g className="flake-arm" style={{ animationDelay: "0.24s" }}>
            <line x1="50" y1="50" x2="50" y2="92" />
            <line x1="50" y1="79" x2="60" y2="88" />
            <line x1="50" y1="79" x2="40" y2="88" />
          </g>
          <g className="flake-arm" style={{ animationDelay: "0.32s" }}>
            <line x1="50" y1="50" x2="18" y2="71" />
            <line x1="29" y1="65" x2="30" y2="78" />
            <line x1="29" y1="65" x2="17" y2="60" />
          </g>
          <g className="flake-arm" style={{ animationDelay: "0.4s" }}>
            <line x1="50" y1="50" x2="18" y2="29" />
            <line x1="29" y1="35" x2="17" y2="40" />
            <line x1="29" y1="35" x2="30" y2="22" />
          </g>
          {/* center */}
          <circle cx="50" cy="50" r="4" className="flake-dot" />
        </svg>
        <p className="freeze-word">{word}</p>
        <div className="freeze-sweep">
          <span />
        </div>
      </div>
    </div>
  );
}
