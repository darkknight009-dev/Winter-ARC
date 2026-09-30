import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

/**
 * Push configuration diagnostics.
 *
 * Verifies the server-side VAPID setup and returns a short fingerprint of
 * the public key. The settings page compares this fingerprint against the
 * browser-side key — a mismatch means the env vars are wrong or stale,
 * which is the usual cause of "Registration failed - push service error"
 * and silently rejected sends.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const priv = process.env.VAPID_PRIVATE_KEY ?? "";

  if (!pub || !priv) {
    return NextResponse.json(
      { configured: false, reason: "VAPID keys missing from server environment." },
      { status: 200 }
    );
  }

  // Validate the pair: signing happens lazily, so ask web-push to build
  // request details for a fake subscription — invalid keys throw at parse
  // time, which is all we care about here.
  let pairValid = true;
  let pairError: string | null = null;
  try {
    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:dev@winterarc.os", pub, priv);
    webpush.generateRequestDetails({
      endpoint: "https://example.com/send/validate",
      keys: { p256dh: pub, auth: "AAAAAAAAAAAAAAAAAAAAAA" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/bad|invalid|key|private/i.test(message)) {
      pairValid = false;
      pairError = message;
    }
  }

  const fingerprint = createHash("sha256").update(pub).digest("hex").slice(0, 12);

  return NextResponse.json({
    configured: true,
    pairValid,
    pairError,
    public_key_fingerprint: fingerprint,
  });
}
