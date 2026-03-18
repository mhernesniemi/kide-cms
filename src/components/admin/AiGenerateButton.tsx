import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "./ui/button";

interface AiGenerateButtonProps {
  endpoint: string;
  payload: Record<string, unknown>;
  targetField: string;
  label?: string;
}

function setFieldValue(name: string, value: string) {
  const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
  if (!field) return;

  // Rich text fields use a custom event to update the Tiptap editor
  if (field.type === "hidden") {
    field.dispatchEvent(new CustomEvent("cms:set-value", { detail: value }));
    return;
  }

  const nativeSetter = Object.getOwnPropertyDescriptor(
    field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    "value",
  )?.set;

  if (nativeSetter) {
    nativeSetter.call(field, value);
  } else {
    field.value = value;
  }

  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function AiGenerateButton({
  endpoint,
  payload,
  targetField,
  label = "Generate with AI",
}: AiGenerateButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const livePayload = { ...payload };
      for (const key of Object.keys(livePayload)) {
        const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${key}"]`);
        if (el) livePayload[key] = el.value;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(livePayload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Generation failed" }));
        throw new Error(err.error || "Generation failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setFieldValue(targetField, accumulated);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleGenerate}
        disabled={loading}
        className="text-foreground/70"
      >
        {loading ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-4 stroke-1" />}
        {label}
      </Button>
      {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
    </div>
  );
}
