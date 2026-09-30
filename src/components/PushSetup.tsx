"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff, Loader2 } from "lucide-react";
import { urlBase64ToUint8Array } from "@/lib/push-client";

/**
 * Push notification opt-in, settings edition.
 *
 * Flow: Notification.requestPermission() must run inside a user gesture,
 * so everything hangs off the toggle button. After permission is granted
 * the browser subscription is registered against our VAPID key and POSTed
 * to /api/push/subscribe.
 */
export function PushSetup() {
  const [supported] = useState(
    () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window
  );
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "default"
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      // Read the external systems (permission + SW subscription), then sync
      // state once — after the awaits, so no cascading sync renders.
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (cancelled) return;
      setPermission(Notification.permission);
      setSubscribed(Boolean(sub));
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  async function subscribe() {
    setBusy(true);
    setMessage(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setMessage("Permission denied. The nudges cannot reach you.");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error("Push is not configured (missing VAPID public key).");

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save subscription");
      }
      setSubscribed(true);
      setMessage("Channel open. First nudge at 18:00 your time.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch(
          `/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`,
          { method: "DELETE" }
        );
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMessage("Notifications off. The cold doesn't care.");
    } catch {
      setMessage("Failed to disable notifications");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Test failed");
      setMessage("Sent. Look at your tray.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Test failed");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <div>
        <p className="text-sm text-ink-faint">
          This browser does not support push notifications. The calendar reminder in the section
          above still works.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        {subscribed ? (
          <button className="btn btn-ghost flex-1" onClick={unsubscribe} disabled={busy}>
            <BellOff size={16} /> Silence the nags
          </button>
        ) : (
          <button className="btn btn-accent flex-1" onClick={subscribe} disabled={busy}>
            <BellRing size={16} /> Enable streak notifications
          </button>
        )}
        {subscribed && (
          <button className="btn btn-ghost shrink-0" onClick={sendTest} disabled={busy}>
            Send test
          </button>
        )}
        {busy && <Loader2 size={16} className="animate-spin text-ink-faint" />}
      </div>

      {permission === "denied" && (
        <p className="mt-3 text-xs leading-relaxed text-fail">
          Notifications are blocked for this site. Unblock them in your browser&apos;s site
          settings to hear the voice again.
        </p>
      )}
      {message && <p className="mt-3 text-xs leading-relaxed text-ink-soft">{message}</p>}
      {subscribed && !message && (
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          Four nudges a day until the day is recorded: 18:00, 20:00, 21:30, 23:00 — your
          timezone. Sealed days stay silent.
        </p>
      )}
    </div>
  );
}
