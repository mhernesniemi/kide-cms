"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import DocumentCombobox from "./DocumentCombobox";

/** A collection whose documents can be the target of an internal link. */
export type LinkableCollection = { collection: string; label: string };

export type LinkTarget = { id: string; collection: string; label: string; href: string };

/**
 * Picks an internal document by searching the linkable collections on the
 * server. The stored value is the document's public route (plus its title),
 * so selection is matched by href rather than id.
 */
export default function InternalLinkPicker({
  editHref,
  editTitle,
  collections,
  onSelect,
  className,
  triggerClassName,
}: {
  editHref: string;
  /** Title stored with the link — shown instead of the raw path. */
  editTitle?: string;
  collections: LinkableCollection[];
  onSelect: (item: LinkTarget) => void;
  className?: string;
  triggerClassName?: string;
}) {
  const slugs = React.useMemo(() => collections.map((c) => c.collection), [collections]);

  return (
    <div className={cn("min-w-0 flex-1", className)}>
      <DocumentCombobox
        collections={slugs}
        groups={collections}
        limit={10}
        placeholder="Search documents..."
        display={editTitle || editHref}
        isSelected={(hit) => !!editHref && hit.href === editHref}
        onPick={(hit) => {
          if (hit.href) onSelect({ id: hit.docId, collection: hit.collection, label: hit.title, href: hit.href });
        }}
        closeOnPick
        triggerClassName={cn("h-9 min-w-0 rounded-lg px-3", triggerClassName)}
      />
    </div>
  );
}
