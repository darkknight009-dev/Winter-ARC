import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public by design: the VAPID public key is already embedded in the client
 * JS bundle (NEXT_PUBLIC_*), so exposing it here leaks nothing. It exists so
 * anyone can verify what key the server is actually configured with — the
 * first thing to check when subscriptions fail with "push service error".
 */
export async function GET() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  return NextResponse.json({
    configured: pub.length > 0,
    length: pub.length,
    prefix: pub.slice(0, 8),
    suffix: pub.slice(-8),
    public_key: pub,
  });
}
