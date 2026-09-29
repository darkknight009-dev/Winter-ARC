"use client";

import { useState } from "react";

export function ShareButton() {
  const [shared, setShared] = useState(false);

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const text = "My Winter Arc — Oct 1 → Feb 28, 151 days on the record. ❄️";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Winter Arc OS", text, url });
        setShared(true);
        return;
      } catch {
        /* user cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button className="btn btn-accent" onClick={share}>
      {shared ? "Copied" : "Share the record"}
    </button>
  );
}
