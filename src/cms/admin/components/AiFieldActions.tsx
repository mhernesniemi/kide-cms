import { useState } from "react";
import { Loader2 } from "lucide-react";
import { runAiAction, type AiAction } from "./AiGenerateButton";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { cn } from "../lib/utils";

/** Filled sparkles drawn on a 16px grid: Lucide's 24px strokes blur at this size. */
function AiIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M6.5 3.5Q7.6 8.4 12.5 9.5 7.6 10.6 6.5 15.5 5.4 10.6.5 9.5 5.4 8.4 6.5 3.5Z" />
      <path d="M12.5.5Q13 3 15.5 3.5 13 4 12.5 6.5 12 4 9.5 3.5 12 3 12.5.5Z" />
    </svg>
  );
}

/** The AI actions for one field, as a quiet icon in its label row. */
export default function AiFieldActions({ actions }: { actions: AiAction[] }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: AiAction) => {
    setLoading(true);
    setError(null);
    try {
      await runAiAction(action);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const label = error ?? "AI actions";
  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={label}
      aria-label={label}
      disabled={loading}
      className={cn(
        "-my-1.5 size-7 transition-opacity",
        error
          ? "text-destructive"
          : "text-indigo-500/60 hover:bg-indigo-500/10 hover:text-indigo-600 dark:text-indigo-300/60 dark:hover:text-indigo-200",
      )}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <AiIcon className="size-4" />}
    </Button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {actions.map((action) => (
          <DropdownMenuItem key={action.label} onClick={() => run(action)}>
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
