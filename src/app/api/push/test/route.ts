import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendTestPush } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * Fire one test push to every device of the signed-in user.
 * Reports the REAL result — including server rejections with status codes —
 * so the settings page can show actionable diagnostics instead of a fake
 * success. A 401/403 from the push service usually means the VAPID key
 * pair in the server env is invalid or mismatched.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json(
      {
        error:
          "Push is not configured on the server: VAPID keys missing from environment variables.",
        sent: 0,
        failed: 0,
        details: [],
      },
      { status: 500 }
    );
  }

  const result = await sendTestPush(user.id);

  if (result.sent === 0 && result.failed === 0) {
    return NextResponse.json(
      { error: "No devices registered. Enable notifications first.", ...result },
      { status: 400 }
    );
  }

  // 200 even when some sends failed — the body carries the truth and the
  // UI renders per-error diagnostics.
  return NextResponse.json({ ok: result.sent > 0, ...result });
}
