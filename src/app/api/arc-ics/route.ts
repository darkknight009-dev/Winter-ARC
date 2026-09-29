import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const stamp = fmt(new Date());

  // DTSTART: today at 21:00 UTC as a floating recurrence anchor.
  const dtstart = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}T210000Z`;

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
    `DTEND:${dtstart.replace("T210000Z", "T211500Z")}`,
    "RRULE:FREQ=DAILY;INTERVAL=1",
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
