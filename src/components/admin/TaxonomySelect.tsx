"use client";

import { useEffect, useState } from "react";
import TreeSelect, { flattenTree, type TreeSelectItem } from "@/components/admin/TreeSelect";

type Props = {
  name: string;
  value?: string;
  taxonomySlug: string;
};

type Term = {
  id: string;
  name: string;
  slug: string;
  children?: Term[];
};

export default function TaxonomySelect({ name, value, taxonomySlug }: Props) {
  const [items, setItems] = useState<TreeSelectItem[]>([]);

  useEffect(() => {
    fetch(`/api/cms/taxonomies?where=${encodeURIComponent(JSON.stringify({ slug: taxonomySlug }))}&status=any`)
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
    />
  );
}
