import { ImageResponse } from "next/og";
import { levelFor } from "@/lib/arc";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Renders the shareable Winter Arc report card as a PNG in the Alpine
 * Editorial palette: warm paper, ink, hairline rules, glacier accent.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("u");
  if (!userId) return new Response("missing user", { status: 400 });

  // Ownership: users may only render their own card.
  const authSupabase = await createClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user || user.id !== userId) {
    return new Response("Forbidden", { status: 403 });
  }

  const ARC_TOTAL_DAYS = 151;

  interface Stats {
    display_name: string;
    identity: string | null;
    days_fought: number;
    habit_checks: number;
    perfect_days: number;
    longest_streak: number;
    total_xp: number;
  }

  let stats: Stats;
  try {
    const { createClient } = await import("@/lib/supabase/admin");
    const supabase = createClient();
    const { data: dbData, error } = await supabase.rpc("report_stats", { p_user: userId });
    if (error || !dbData) throw new Error("no stats");
    stats = dbData as Stats;
  } catch {
    stats = {
      display_name: "Arc Runner",
      identity: null,
      days_fought: 0,
      habit_checks: 0,
      perfect_days: 0,
      longest_streak: 0,
      total_xp: 0,
    };
  }

  const level = levelFor(stats.total_xp);
  const data = {
    ...stats,
    completion: Math.min(100, Math.round((stats.days_fought / ARC_TOTAL_DAYS) * 100)),
    level: level.level,
    title: level.title,
  };

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0b0d",
          padding: 56,
          color: "#f2f5f7",
          fontFamily: "sans-serif",
        }}
      >
        {/* Masthead */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 20, letterSpacing: 6, color: "#6e7580", display: "flex" }}>
            WINTER ARC OS
          </div>
          <div
            style={{
              fontSize: 96,
              fontWeight: 600,
              color: "#f2f5f7",
              marginTop: 16,
              display: "flex",
              fontFamily: "'Arial Narrow', 'Helvetica Neue', sans-serif",
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            {data.display_name}
          </div>
          {data.identity ? (
            <div
              style={{
                fontSize: 32,
                color: "#a6adb6",
                marginTop: 10,
                display: "flex",
                textTransform: "uppercase",
                letterSpacing: 3,
              }}
            >
              {data.identity}
            </div>
          ) : null}
        </div>

        {/* Stat plates */}
        <div style={{ display: "flex", gap: 14 }}>
          <Card label="DAYS FOUGHT" value={String(data.days_fought)} />
          <Card label="HABIT CHECKS" value={String(data.habit_checks)} />
          <Card label="PERFECT DAYS" value={String(data.perfect_days)} />
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <Card label="LONGEST STREAK" value={`${data.longest_streak} d`} />
          <Card label="LEVEL" value={`Lv ${data.level}`} />
          <Card label="ARC DONE" value={`${data.completion}%`} />
        </div>

        {/* Footer rule */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: "2px solid #f2f5f7",
            paddingTop: 24,
          }}
        >
          <div style={{ fontSize: 22, color: "#6e7580", display: "flex" }}>
            Oct 1 → Feb 28 · 151 days on the record
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 3,
              color: "#ff4a1f",
              display: "flex",
            }}
          >
            LV {data.level} · {data.title.toUpperCase()}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        border: "1px solid #2c3037",
        background: "#101216",
        borderRadius: 8,
        padding: "20px 22px",
      }}
    >
      <div style={{ fontSize: 15, letterSpacing: 3, color: "#6e7580", display: "flex" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 48,
          fontWeight: 600,
          color: "#f2f5f7",
          display: "flex",
          fontFamily: "'Arial Narrow', 'Helvetica Neue', sans-serif",
        }}
      >
        {value}
      </div>
    </div>
  );
}
