import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendTestPush } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Fire one test push to every device of the signed-in user. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await sendTestPush(user.id);
  if (result.sent === 0 && result.failed === 0) {
    return NextResponse.json(
      { error: "No devices registered. Enable notifications first." },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, ...result });
}
