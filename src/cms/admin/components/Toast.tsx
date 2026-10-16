import { CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "../lib/utils";

/** Server-rendered toast — no hydration; CSS animations handle the auto-dismiss. */
export function Toast({ status, message }: { status: "success" | "error"; message: string }) {
  const isError = status === "error";
  return (
    // Centering wrapper — keeps left-1/2 -translate-x-1/2 stable while inner div animates
    <div className="fixed top-4 left-1/2 z-[60] w-full max-w-sm -translate-x-1/2">
      <div
        id="admin-toast"
        role={isError ? "alert" : "status"}
        className={cn(
          "bg-card flex items-center gap-2 rounded-lg border px-5 py-3 text-sm shadow-lg",
          isError ? "border-red-500/30" : "border-green-500/30",
        )}
        style={{
          animation: `toast-in 0.25s ease-out, toast-out 0.3s ease-in ${isError ? "4.7s" : "2.7s"} forwards`,
        }}
      >
        {isError ? (
          <CircleAlert className="size-4 shrink-0 text-red-600 dark:text-red-400" />
        ) : (
          <CircleCheck className="size-4 shrink-0 text-green-600 dark:text-green-400" />
        )}
        <span className={cn(isError ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400")}>
          {message}
        </span>
      </div>
    </div>
  );
}
