"use client";

import { useState } from "react";
import { renderSVG } from "uqr";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const AUTH_BASE = "/api/cms/auth";

type Step =
  | { kind: "idle" }
  | { kind: "password"; intent: "enable" | "disable" | "codes" }
  | { kind: "scan"; totpURI: string; backupCodes: string[] }
  | { kind: "codes"; backupCodes: string[] };

const post = async (path: string, body: Record<string, unknown>) => {
  const response = await fetch(`${AUTH_BASE}${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message ?? data?.error ?? "Request failed");
  return data;
};

const reloadWith = (message: string) => {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ _toast: "success", _msg: message }).toString();
  window.location.assign(url.toString());
};

function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-sm">
        Save these backup codes somewhere safe. Each one signs you in once if you lose your authenticator.
      </p>
      <pre className="bg-muted rounded-md px-3 py-2 font-mono text-sm leading-6 select-all">{codes.join("\n")}</pre>
    </div>
  );
}

export default function TwoFactorSettings({ enabled, required }: { enabled: boolean; required: boolean }) {
  const [step, setStep] = useState<Step>(
    required && !enabled ? { kind: "password", intent: "enable" } : { kind: "idle" },
  );
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = (intent: "enable" | "disable" | "codes") =>
    run(async () => {
      if (intent === "enable") {
        const data = await post("/two-factor/enable", { password });
        setStep({ kind: "scan", totpURI: data.totpURI, backupCodes: data.backupCodes ?? [] });
      } else if (intent === "disable") {
        await post("/two-factor/disable", { password });
        reloadWith("Two-factor authentication turned off.");
      } else {
        const data = await post("/two-factor/generate-backup-codes", { password });
        setStep({ kind: "codes", backupCodes: data.backupCodes ?? [] });
      }
      setPassword("");
    });

  const confirmCode = () =>
    run(async () => {
      await post("/two-factor/verify-totp", { code: code.replace(/\s+/g, "") });
      reloadWith("Two-factor authentication is on.");
    });

  if (step.kind === "password") {
    const label = step.intent === "enable" ? "Continue" : step.intent === "disable" ? "Turn off" : "Generate new codes";
    return (
      <form
        className="grid max-w-sm gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submitPassword(step.intent);
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="tf-password">Confirm your password</Label>
          <Input
            id="tf-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoFocus
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {label}
          </Button>
          {!(required && !enabled) && (
            <Button type="button" variant="ghost" onClick={() => setStep({ kind: "idle" })}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    );
  }

  if (step.kind === "scan") {
    const secret = new URL(step.totpURI).searchParams.get("secret") ?? "";
    return (
      <div className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
          <div
            className="size-44 rounded-md bg-white p-2 [&_svg]:size-full"
            // uqr renders an SVG string from the otpauth URI the server returned.
            dangerouslySetInnerHTML={{ __html: renderSVG(step.totpURI) }}
          />
          <div className="grid gap-2 text-sm">
            <p>Scan the code with an authenticator app (1Password, Google Authenticator, Microsoft Authenticator…).</p>
            <p className="text-muted-foreground">Can't scan? Enter this key:</p>
            <code className="bg-muted rounded-md px-2 py-1 font-mono text-xs break-all select-all">{secret}</code>
          </div>
        </div>
        <BackupCodes codes={step.backupCodes} />
        <form
          className="grid max-w-sm gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void confirmCode();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="tf-code">Enter the 6-digit code to finish</Label>
            <Input
              id="tf-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div>
            <Button type="submit" disabled={busy}>
              Turn on
            </Button>
          </div>
        </form>
      </div>
    );
  }

  if (step.kind === "codes") {
    return (
      <div className="grid gap-3">
        <BackupCodes codes={step.backupCodes} />
        <p className="text-muted-foreground text-sm">Your previous backup codes no longer work.</p>
        <div>
          <Button type="button" variant="outline" onClick={() => setStep({ kind: "idle" })}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {enabled ? (
        <>
          <Button type="button" variant="outline" onClick={() => setStep({ kind: "password", intent: "codes" })}>
            New backup codes
          </Button>
          {!required && (
            <Button type="button" variant="ghost" onClick={() => setStep({ kind: "password", intent: "disable" })}>
              Turn off
            </Button>
          )}
        </>
      ) : (
        <Button type="button" onClick={() => setStep({ kind: "password", intent: "enable" })}>
          Set up authenticator app
        </Button>
      )}
    </div>
  );
}
