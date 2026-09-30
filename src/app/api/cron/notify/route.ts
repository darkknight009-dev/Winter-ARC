import { NextResponse } from "next/server";
import {
  dayIndexOf,
  currentStreak,
  zonedNow,
  arcStartDate,
  ARC_TOTAL_DAYS,
} from "@/lib/arc";
import { PUSH_SCHEDULE, pushCopy, COMEBACK_COPY } from "@/lib/push-messages";
import { sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The nag engine.
 *
 * Runs on a cron (every 15 minutes recommended). For every user with at
 * least one push subscription it:
 *   1. Computes "now" in THEIR timezone (day boundaries are theirs, not UTC)
 *   2. Checks which scheduled push (18:00 / 20:00 / 21:30 / 23:00) has just
 *      come due and hasn't been sent yet (push_log dedupes per kind/day)
 *   3. Decides tone from the streak: soft < 7, hard 7-29, nuclear 30+
 *
 * Auth: Authorization: Bearer $CRON_SECRET (set in cron-job.org headers).
 */

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  // Subscriptions of everyone who opted in (RLS bypassed: cron is trusted).
  const { data: subs, error: subsErr } = await admin
    .from("push_subscriptions")
    .select("user_id");
  if (subsErr) {
    return NextResponse.json({ error: subsErr.message }, { status: 500 });
  }
  const userIds = [...new Set((subs ?? []).map((s) => s.user_id))];
  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, sent: 0 });
  }

  // Fetch everything needed for candidate evaluation in bulk.
  const [{ data: profiles }, { data: habits }, { data: freezeRows }] = await Promise.all([
    admin.from("profiles").select("id, timezone").in("id", userIds),
    admin.from("habits").select("user_id").in("user_id", userIds),
    admin.from("freezes").select("user_id, arc_year, arc_day").in("user_id", userIds),
  ]);

  const tzByUser = new Map<string, string>();
  for (const p of profiles ?? []) tzByUser.set(p.id, p.timezone || "UTC");
  const habitCountByUser = new Map<string, number>();
  for (const h of habits ?? []) {
    habitCountByUser.set(h.user_id, (habitCountByUser.get(h.user_id) ?? 0) + 1);
  }
  const freezesByUser = new Map<string, number[]>();
  for (const f of freezeRows ?? []) {
    const list = freezesByUser.get(f.user_id) ?? [];
    list.push(f.arc_day);
    freezesByUser.set(f.user_id, list);
  }

  let sent = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    try {
      const timezone = tzByUser.get(userId) ?? "UTC";
      const now = zonedNow(timezone);
      const arcYear = arcStartDate(now).getFullYear();
      const todayIdx = dayIndexOf(now);
      if (todayIdx < 0 || todayIdx >= ARC_TOTAL_DAYS) continue; // pre-arc / over

      // Which scheduled pushes are due "now" (within the following window)?
      const minuteOfDay = now.getHours() * 60 + now.getMinutes();
      const due = PUSH_SCHEDULE.filter((slot) => {
        const slotMin = slot.hour * 60 + slot.minute;
        return minuteOfDay >= slotMin && minuteOfDay < slotMin + 15;
      });
      if (due.length === 0) continue;

      const habitCount = habitCountByUser.get(userId) ?? 0;
      if (habitCount === 0) continue;

      // Load today's and yesterday's check-in for streak logic.
      const { data: recent } = await admin
        .from("checkins")
        .select("arc_day, habits_done")
        .eq("user_id", userId)
        .eq("arc_year", arcYear)
        .gte("arc_day", todayIdx - 1)
        .lte("arc_day", todayIdx);

      const todayRow = recent?.find((r) => r.arc_day === todayIdx);
      const yestRow = recent?.find((r) => r.arc_day === todayIdx - 1);
      const doneToday = (todayRow?.habits_done.length ?? 0) >= habitCount;
      if (doneToday) continue; // sealed days stay silent

      // Yesterday missed and nothing logged yet today? Prepend the comeback
      // push so the first nudge of the day is the "the streak is dead, you
      // aren't" message instead of a standard slot.
      const missedYesterday =
        (yestRow?.habits_done.length ?? 0) < habitCount &&
        !(freezesByUser.get(userId) ?? []).includes(todayIdx - 1);

      const streak = (() => {
        const completedMap = new Map<number, number>();
        for (const c of recent ?? [])
          if (c.arc_day < todayIdx) completedMap.set(c.arc_day, c.habits_done.length);
        // Frozen days count as kept; rebuild from the full freeze list.
        const frozenSet = new Set(freezesByUser.get(userId) ?? []);
        for (const d of frozenSet) if (!completedMap.has(d)) completedMap.set(d, habitCount);
        return currentStreak(completedMap, frozenSet, habitCount, todayIdx);
      })();

      // Which of the due pushes have we already sent today?
      const kinds = due.map((d) => d.kind);
      const { data: logRows } = await admin
        .from("push_log")
        .select("kind")
        .eq("user_id", userId)
        .eq("arc_year", arcYear)
        .eq("arc_day", todayIdx)
        .in("kind", kinds);
      const sentKinds = new Set((logRows ?? []).map((r) => r.kind));
      const pending = due.filter((d) => !sentKinds.has(d.kind));
      if (pending.length === 0) continue;

      for (const slot of pending) {
        // The comeback roast replaces the first nudge of a day after a miss.
        const useComeback = missedYesterday && slot.kind === "headsup" && !sentKinds.has("comeback");
        const copy = useComeback
          ? { ...COMEBACK_COPY, tag: `wao-comeback-${new Date().toISOString().slice(0, 10)}` }
          : pushCopy(slot.kind, streak);
        const kind = useComeback ? "comeback" : slot.kind;
        const res = await sendPushToUser(userId, { ...copy, url: "/" });
        await admin.from("push_log").upsert(
          {
            user_id: userId,
            arc_year: arcYear,
            arc_day: todayIdx,
            kind,
          },
          { onConflict: "user_id,arc_year,arc_day,kind" }
        );
        if (res.sent > 0) {
          sent += 1;
          if (useComeback) sentKinds.add("comeback");
        }
      }
    } catch (err) {
      errors.push(`${userId}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  return NextResponse.json({ ok: true, users: userIds.length, sent, errors });
}
