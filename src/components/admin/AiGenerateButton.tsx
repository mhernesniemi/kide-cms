import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "./ui/button";

interface AiGenerateButtonProps {
  endpoint: string;
  payload: Record<string, unknown>;
  targetField: string;
  label?: string;
}

export default function AiGenerateButton({
  endpoint,
  payload,
  targetField,
  label = "Generate with AI",
}: AiGenerateButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Generation failed" }));
        throw new Error(err.error || "Generation failed");
      }

      const data = await response.json();
      const result = data.result;

      // Find the target field and set its value
      const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${targetField}"]`);
      if (field) {
        // Use native setter to trigger React's onChange
        const nativeSetter = Object.getOwnPropertyDescriptor(
          field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
          "value",
        )?.set;

        if (nativeSetter) {
          nativeSetter.call(field, result);
        } else {
          field.value = result;
        }

        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } catch {
      // Silent fail — user can see the field didn't update
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleGenerate} disabled={loading} className="gap-1.5">
      {loading ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
      {label}
    </Button>
  );
}
