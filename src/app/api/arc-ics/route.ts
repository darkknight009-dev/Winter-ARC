import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { arcStartDate, arcEndDate } from "@/lib/arc";

export const dynamic = "force-dynamic";

/**
 * Daily check-in reminder as a recurring calendar event (.ics).
 * Imports into Google Calendar, Apple Calendar, Outlook — any RFC 5545 client.
 * The reminder fires at 21:00 local time each day until the arc ends.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Anchor the recurrence to the arc window around "now".
  const now = new Date();
  const start = arcStartDate(now);
  const end = arcEndDate(now);

  const fmtUTC = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const stamp = fmtUTC(new Date());

  // FLOATING local time (no Z, no TZID): the event fires at 21:00 in the
  // user's own timezone — 9 PM IST stays 9 PM IST. Anchored to the arc's
  // Oct 1 (arcStartDate handles pre-arc: Sep 30 -> upcoming Oct 1).
  const dtstart = `${start.getFullYear()}1001T210000`; // Oct 1, 21:00 local
  const until = `${end.getFullYear()}0228T235959`; // stop after Feb 28

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Winter Arc OS//Check-in Reminder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:winter-arc-reminder-${user.id}@winterarc.os`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtstart.replace("T210000", "T211500")}`,
    `RRULE:FREQ=DAILY;INTERVAL=1;UNTIL=${until}`,
    `SUMMARY:Winter Arc — Record the day ❄️`,
    "DESCRIPTION:60 seconds. Toggle your habits\\, one honest line\\, seal the day. Your streak only survives if tonight decides.",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Winter Arc check-in in 30 minutes",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="winter-arc-reminder.ics"',
      "Cache-Control": "no-store",
    },
  });
}
