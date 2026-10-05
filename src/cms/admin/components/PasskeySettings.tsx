"use client";

import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { KeyRound, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "./ui/button";

const AUTH_BASE = "/api/cms/auth";

type Passkey = { id: string; name: string | null; createdAt: string | null };

const reloadWith = (message: string) => {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ _toast: "success", _msg: message }).toString();
  window.location.assign(url.toString());
};

const deviceName = () => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "iPhone or iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Passkey";
};

export default function PasskeySettings({ passkeys, dateLocale }: { passkeys: Passkey[]; dateLocale?: string }) {
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(browserSupportsWebAuthn());
  }, []);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const optionsResponse = await fetch(`${AUTH_BASE}/passkey/generate-register-options`, {
        credentials: "same-origin",
      });
      if (optionsResponse.status === 403 || optionsResponse.status === 401) {
        throw new Error("For security, sign out and back in before adding a passkey.");
      }
      if (!optionsResponse.ok) throw new Error("Couldn't start passkey setup.");
      const attestation = await startRegistration({ optionsJSON: await optionsResponse.json() });
      const verify = await fetch(`${AUTH_BASE}/passkey/verify-registration`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: attestation, name: deviceName() }),
      });
      if (!verify.ok) throw new Error("The passkey couldn't be saved. Try again.");
      reloadWith("Passkey added.");
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === "NotAllowedError")) {
        setError(cause instanceof Error ? cause.message : "Something went wrong.");
      }
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    const response = await fetch(`${AUTH_BASE}/passkey/delete-passkey`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (response.ok) reloadWith("Passkey removed.");
    else {
      setError("The passkey couldn't be removed.");
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3">
      {passkeys.length > 0 && (
        <ul className="divide-border divide-y rounded-md border">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <KeyRound className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{passkey.name ?? "Passkey"}</span>
              {passkey.createdAt && (
                <span className="text-muted-foreground text-xs">
                  Added {new Date(passkey.createdAt).toLocaleDateString(dateLocale)}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${passkey.name ?? "passkey"}`}
                disabled={busy}
                onClick={() => void remove(passkey.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {supported ? (
        <div>
          <Button type="button" variant={passkeys.length ? "outline" : "default"} disabled={busy} onClick={add}>
            Add a passkey
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">This browser doesn't support passkeys.</p>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
