"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff, Loader2 } from "lucide-react";
import { urlBase64ToUint8Array } from "@/lib/push-client";

interface PushErrorDetail {
  endpoint: string;
  statusCode?: number;
  message: string;
}

interface TestResult {
  ok?: boolean;
  sent?: number;
  failed?: number;
  details?: PushErrorDetail[];
  error?: string;
}

/**
 * Push notification opt-in, settings edition.
 *
 * Reliability rules learned the hard way:
 *  - Any stale subscription is unsubscribed BEFORE subscribing again. A
 *    corrupt old subscription makes pushManager.subscribe() throw
 *    "Registration failed - push service error".
 *  - The browser key is fingerprint-compared against the server key via
 *    /api/push/config. A mismatch means the Vercel env vars are wrong —
 *    subscriptions would succeed but every send would be rejected.
 *  - The test button reports the REAL server result, per error.
 */
export function PushSetup() {
  const [supported] = useState(
    () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window
  );
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<PushErrorDetail[] | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [keyMismatch, setKeyMismatch] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      // Read external systems first, sync state once (no cascading renders).
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (cancelled) return;
      setPermission(Notification.permission);
      setSubscribed(Boolean(sub));

      // Compare browser key fingerprint against the server's.
      const localKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (localKey) {
        try {
          const [cfgRes, pkRes] = await Promise.all([
            fetch("/api/push/config"),
            fetch("/api/push/public-key"),
          ]);
          const cfg = await cfgRes.json();
          const pk = await pkRes.json();
          if (!cancelled) {
            if (cfg.configured === false || pk.configured === false) {
              setKeyMismatch("Server has no VAPID keys — check Vercel environment variables.");
            } else if (pk.public_key !== localKey) {
              setKeyMismatch(
                "This build's public key differs from the server's configured key. Fix NEXT_PUBLIC_VAPID_PUBLIC_KEY (and VAPID_PRIVATE_KEY) in Vercel, redeploy, then re-enable notifications."
              );
            } else if (cfg.pairValid === false) {
              setKeyMismatch(`Server key pair is invalid: ${cfg.pairError ?? "unknown"}`);
            } else {
              const enc = new TextEncoder().encode(localKey);
              const digest = await crypto.subtle.digest("SHA-256", enc);
              const fp = Array.from(new Uint8Array(digest))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("")
                .slice(0, 12);
              if (cfg.public_key_fingerprint && fp !== cfg.public_key_fingerprint) {
                setKeyMismatch(
                  "The public key in this build differs from the server's private key. Update the Vercel env vars and redeploy, then re-enable notifications here."
                );
              }
            }
          }
        } catch {
          /* diagnostics unavailable — not fatal */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  /** Wait until the newest service worker version is the active one. */
  async function waitForSwActivation(reg: ServiceWorkerRegistration): Promise<void> {
    await navigator.serviceWorker.ready;
    // If an updated SW is waiting, tell it to take over and wait for it.
    if (reg.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
      await new Promise<void>((resolve) => {
        const onChange = () => resolve();
        navigator.serviceWorker.addEventListener("controllerchange", onChange, { once: true });
        setTimeout(resolve, 3000); // don't hang forever
      });
    }
    if (reg.active && reg.active.state !== "activated") {
      await new Promise<void>((resolve) => {
        const onState = (e: Event) => {
          if ((e.target as ServiceWorker).state === "activated") {
            reg.active!.removeEventListener("statechange", onState);
            resolve();
          }
        };
        reg.active!.addEventListener("statechange", onState);
        setTimeout(resolve, 3000);
      });
    }
  }

  async function doSubscribe(reg: ServiceWorkerRegistration, vapidKey: string) {
    return reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  }

  async function subscribe() {
    setBusy(true);
    setMessage(null);
    setErrorDetails(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setMessage("Permission denied. The nudges cannot reach you.");
        return;
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error("Push is not configured (missing VAPID public key).");

      const reg = await navigator.serviceWorker.register("/sw.js");
      // An updated SW sitting in "waiting" breaks pushManager.subscribe()
      // with "push service error" — force it active first.
      reg.update().catch(() => {});
      await waitForSwActivation(reg);

      // If a subscription already exists with the SAME key, do NOT destroy
      // it — unsubscribe-then-resubscribe races the push service and throws.
      // Just re-sync it to the server (self-heals a missing DB row).
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(existing.toJSON()),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to save subscription");
        }
        setSubscribed(true);
        setMessage("Channel re-synced. First nudge at 18:00 your time.");
        return;
      }

      let sub;
      try {
        sub = await doSubscribe(reg, vapidKey);
      } catch {
        // Transient FCM hiccup or a dying stale subscription: clear it,
        // let the push service settle, then try exactly once more.
        const stale = await reg.pushManager.getSubscription();
        if (stale) {
          await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(stale.endpoint)}`, {
            method: "DELETE",
          }).catch(() => {});
          await stale.unsubscribe().catch(() => {});
          await new Promise((r) => setTimeout(r, 500));
        }
        sub = await doSubscribe(reg, vapidKey);
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save subscription");
      }
      setSubscribed(true);
      setMessage("Channel open. First nudge at 18:00 your time.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setMessage(
        /push service error|registration failed/i.test(msg)
          ? `${msg} — clear this site's data in your browser settings (or DevTools → Application → Service Workers → Unregister), reload, and press enable again.`
          : msg
      );
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    setMessage(null);
    setErrorDetails(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
          method: "DELETE",
        });
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
    setErrorDetails(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const body: TestResult = await res.json().catch(() => ({}));
      if (!res.ok && !body.sent && !body.failed) {
        throw new Error(body.error || "Test failed");
      }
      if (body.sent && body.sent > 0) {
        setMessage(`Sent to ${body.sent} device${body.sent > 1 ? "s" : ""}. Check the tray.`);
      } else if (body.details && body.details.length > 0) {
        const d = body.details[0];
        setErrorDetails(body.details);
        setMessage(
          `The push service rejected the send${
            d.statusCode ? ` (HTTP ${d.statusCode})` : ""
          }. ${d.statusCode === 401 || d.statusCode === 403 ? "This means the VAPID key pair on the server is wrong — recheck the Vercel env vars." : d.message}`
        );
      } else {
        setMessage(body.error || "Send failed — no detail returned.");
      }
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
      {keyMismatch && (
        <p className="mb-3 border border-fail bg-ember-wash px-3 py-2 text-xs leading-relaxed text-fail">
          {keyMismatch}
        </p>
      )}

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
      {errorDetails && (
        <pre className="nice-scroll mt-3 max-h-32 overflow-auto border border-rule bg-sunken p-3 text-[10px] leading-relaxed text-ink-faint">
          {errorDetails
            .map((d) => `${d.statusCode ?? "?"} ${d.endpoint.slice(0, 60)}… — ${d.message}`)
            .join("\n")}
        </pre>
      )}
      {subscribed && !message && (
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          Four nudges a day until the day is recorded: 18:00, 20:00, 21:30, 23:00 — your
          timezone. Sealed days stay silent.
        </p>
      )}
    </div>
  );
}
