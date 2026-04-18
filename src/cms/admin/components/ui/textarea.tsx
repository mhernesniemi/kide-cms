import * as React from "react";

import { cn } from "../../lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input hover:border-foreground/20 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 bg-muted/30 read-only:hover:border-input read-only:focus-visible:border-input read-only:text-muted-foreground flex field-sizing-content min-h-16 w-full rounded-lg border px-3 py-2.5 text-base transition-colors outline-none read-only:cursor-not-allowed focus-visible:ring-3 read-only:focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
