import { useEffect, useState } from "react";

export type SharedSectionState = "loading" | "ok" | "missing";

/**
 * Resolves a shared-section reference so a block can tell "the source exists" from
 * "the source was deleted". A dangling reference has nothing to detach to, so the
 * editors offer removing the block instead of failing at detach time.
 *
 * `known` short-circuits the lookup: the edit view already ships the section list,
 * so only references missing from it (deleted, or past the list's 500-row cap) cost
 * a request. A non-404 failure resolves as `ok` — a flaky request is not evidence
 * that the section is gone.
 */
export function useSharedSection(ref: string | null, known: boolean): SharedSectionState {
  // Keyed by ref so a resolved answer is never read against a different reference.
  const [resolved, setResolved] = useState<{ ref: string; state: SharedSectionState } | null>(null);

  useEffect(() => {
    if (!ref || known) return;
    const controller = new AbortController();
    fetch(`/api/cms/shared-sections/${ref}?status=any`, { credentials: "same-origin", signal: controller.signal })
      .then((res) => setResolved({ ref, state: res.status === 404 ? "missing" : "ok" }))
      .catch(() => {
        if (!controller.signal.aborted) setResolved({ ref, state: "ok" });
      });
    return () => controller.abort();
  }, [ref, known]);

  if (!ref || known) return "ok";
  return resolved?.ref === ref ? resolved.state : "loading";
}
