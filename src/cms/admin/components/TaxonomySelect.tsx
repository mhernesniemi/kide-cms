"use client";

import { useEffect, useState } from "react";
import TreeSelect, { flattenTree, type TreeSelectItem } from "./TreeSelect";

type Props = {
  name: string;
  value?: string;
  taxonomySlug: string;
  multiple?: boolean;
};

type Term = {
  id: string;
  name: string;
  slug: string;
  children?: Term[];
};

export default function TaxonomySelect({ name, value, taxonomySlug, multiple }: Props) {
  const [items, setItems] = useState<TreeSelectItem[]>([]);

  useEffect(() => {
    // Terms are translatable: a document's FI tab picks from the FI term tree.
    const locale = new URLSearchParams(window.location.search).get("locale");
    const where = encodeURIComponent(JSON.stringify({ slug: taxonomySlug }));
    fetch(`/api/cms/taxonomies?where=${where}&status=any${locale ? `&locale=${encodeURIComponent(locale)}` : ""}`)
      .then((res) => (res.ok ? res.json() : { docs: [] }))
      .then((result) => {
        const doc = result.docs?.[0] ?? result[0];
        if (!doc?.terms) return;
        const parsed = typeof doc.terms === "string" ? JSON.parse(doc.terms) : doc.terms;
        if (Array.isArray(parsed)) {
          setItems(
            flattenTree(
              parsed as Term[],
              (t) => t.slug,
              (t) => t.name,
            ),
          );
        }
      })
      .catch(() => {});
  }, [taxonomySlug]);

  return (
    <TreeSelect
      name={name}
      value={value}
      placeholder={`Search ${taxonomySlug}...`}
      searchPlaceholder="Search terms..."
      emptyMessage="No terms found."
      items={items}
      multiple={multiple}
    />
  );
}
