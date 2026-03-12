import * as React from "react";

import { cn } from "../../../lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-[var(--admin-input-border)] bg-[var(--admin-surface)] px-3 py-2 text-sm text-[var(--admin-foreground)] shadow-sm transition-colors placeholder:text-[var(--admin-placeholder)] hover:border-[color-mix(in_oklab,var(--admin-input-border)_70%,var(--admin-foreground)_30%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-surface)] disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
