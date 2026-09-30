import webpush from "web-push";
import type { PushCopy } from "./push-messages";

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:dev@winterarc.os",
      pub,
      priv
    );
    configured = true;
  } else {
    configured = false;
  }
  return configured;
}

export interface PushErrorDetail {
  endpoint: string;
  statusCode?: number;
  message: string;
}

export interface SendResult {
  sent: number;
  /** Endpoints that returned 404/410 — must be pruned from the DB. */
  dead: string[];
  failed: number;
  /** Rejection details for diagnostics (shown by the settings page). */
  details: PushErrorDetail[];
}

/** Fire a push to every device registered for this user. */
export async function sendPushToUser(
  userId: string,
  payload: PushCopy & { url?: string }
): Promise<SendResult> {
  const result: SendResult = { sent: 0, dead: [], failed: 0, details: [] };
  if (!ensureConfigured()) return result;

  const { createAdminClient } = await import("./supabase/admin");
  const admin = createAdminClient();

  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error || !subs || subs.length === 0) return result;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
        result.sent += 1;
      } catch (err) {
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        const message = err instanceof Error ? err.message : String(err);
        if (statusCode === 404 || statusCode === 410) {
          result.dead.push(sub.endpoint);
        } else {
          result.failed += 1;
          result.details.push({ endpoint: sub.endpoint, statusCode, message });
        }
      }
    })
  );

  // Prune dead subscriptions (browser uninstalled, permission revoked, etc.)
  if (result.dead.length > 0) {
    await admin.from("push_subscriptions").delete().in("endpoint", result.dead);
  }
  return result;
}

/** Send a generic test push (used by the settings page). No emojis — roast grade. */
export async function sendTestPush(userId: string): Promise<SendResult> {
  return sendPushToUser(userId, {
    title: "This is the voice. Remember it.",
    body: "At 18:00, 20:00, 21:30 and 23:00 it will ask one question: did you log the day? Answer accordingly.",
    tag: `wao-test-${Date.now()}`,
    url: "/",
  });
}
