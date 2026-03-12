import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../../lib/utils";

export const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-[var(--admin-accent-subtle)] text-blue-800",
      secondary: "bg-[var(--admin-muted)] text-[var(--admin-foreground)]",
      success: "bg-emerald-100 text-emerald-800",
      warning: "bg-amber-100 text-amber-800",
      destructive: "bg-[var(--admin-destructive-subtle)] text-red-800",
      outline: "border border-[var(--admin-input-border)] text-[var(--admin-foreground-secondary)]",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
