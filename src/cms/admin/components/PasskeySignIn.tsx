"use client";

import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "./ui/button";

const AUTH_BASE = "/api/cms/auth";

export default function PasskeySignIn() {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(browserSupportsWebAuthn());
  }, []);

  if (!supported) return null;

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const optionsResponse = await fetch(`${AUTH_BASE}/passkey/generate-authenticate-options`, {
        credentials: "same-origin",
      });
      if (!optionsResponse.ok) throw new Error("options");
      const assertion = await startAuthentication({ optionsJSON: await optionsResponse.json() });
      const verify = await fetch(`${AUTH_BASE}/passkey/verify-authentication`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: assertion }),
      });
      if (!verify.ok) throw new Error("verify");
      window.location.assign("/admin");
    } catch (cause) {
      // Closing the browser prompt is not an error worth shouting about.
      if (cause instanceof Error && cause.name === "NotAllowedError") setError(null);
      else setError("That passkey didn't work. Try again or use another sign-in method.");
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 grid gap-2">
      <Button type="button" variant="outline" size="lg" className="w-full" disabled={busy} onClick={signIn}>
        <KeyRound className="size-4" />
        {busy ? "Waiting for passkey…" : "Sign in with a passkey"}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
