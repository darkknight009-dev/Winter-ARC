import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { milestoneCopy } from "@/lib/push-messages";

export const dynamic = "force-dynamic";

/**
 * Called by the client the moment a day is sealed.
 * Two jobs:
 *   1. Log a "completed" entry in push_log for today — the evening ladder
 *      checks this and stays silent for sealed days.
 *   2. If the just-sealed day completes a milestone streak (7/30/75/151),
 *      send the milestone roast immediately.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { arcYear?: number; arcDay?: number; streakAfter?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const arcYear = Number(body.arcYear);
  const arcDay = Number(body.arcDay);
  if (!Number.isFinite(arcYear) || !Number.isFinite(arcDay) || arcDay < 0) {
    return NextResponse.json({ error: "Bad arc day" }, { status: 400 });
  }

  // 1. Mark the day as handled so scheduled nudges skip it.
  await supabase.from("push_log").upsert(
    { user_id: user.id, arc_year: arcYear, arc_day: arcDay, kind: "completed" },
    { onConflict: "user_id,arc_year,arc_day,kind" }
  );

  // 2. Milestone celebration — recompute the streak server-side, never trust
  //    the client's number for the actual milestone decision.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const a = createAdminClient();
  const { data: habitRows } = await a.from("habits").select("id").eq("user_id", user.id);
  const habitCount = habitRows?.length ?? 0;
  if (habitCount === 0) return NextResponse.json({ ok: true, milestone: false });

  const { data: hist } = await a
    .from("checkins")
    .select("arc_day, habits_done")
    .eq("user_id", user.id)
    .eq("arc_year", arcYear)
    .lte("arc_day", arcDay)
    .order("arc_day");
  const { data: freezeRows } = await a
    .from("freezes")
    .select("arc_day")
    .eq("user_id", user.id)
    .eq("arc_year", arcYear);
  const frozenDays: number[] = (freezeRows ?? []).map((f) => f.arc_day);

  const completedMap = new Map<number, number>();
  for (const c of hist ?? []) completedMap.set(c.arc_day, c.habits_done.length);
  const frozenSet = new Set(frozenDays);

  // Count backwards from arcDay: consecutive complete-or-frozen days.
  let streak = 0;
  for (let i = arcDay; i >= 0; i -= 1) {
    const done = (completedMap.get(i) ?? 0) >= habitCount;
    if (done || frozenSet.has(i)) streak += 1;
    else break;
  }

  const milestone = milestoneCopy(streak);
  if (milestone) {
    const res = await sendPushToUser(user.id, {
      ...milestone,
      tag: `wao-milestone-${streak}-${arcYear}`,
      url: "/progress",
    });
    return NextResponse.json({ ok: true, milestone: true, streak, ...res });
  }

  return NextResponse.json({ ok: true, milestone: false, streak });
}
