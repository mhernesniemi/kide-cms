"use client";

import { useEffect, useRef, useState } from "react";
import SelectField from "@/components/admin/SelectField";

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

function flattenTerms(terms: Term[], prefix = ""): Array<{ value: string; label: string }> {
  const result: Array<{ value: string; label: string }> = [];
  for (const term of terms) {
    const label = prefix ? `${prefix} / ${term.name}` : term.name;
    result.push({ value: term.slug, label });
    if (term.children?.length) {
      result.push(...flattenTerms(term.children, label));
    }
  }
  return result;
}

export default function TaxonomySelect({ name, value, taxonomySlug }: Props) {
  const [items, setItems] = useState<Array<{ value: string; label: string }>>([]);
  const hiddenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/cms/taxonomies?where=${encodeURIComponent(JSON.stringify({ slug: taxonomySlug }))}&status=any`)
      .then((res) => (res.ok ? res.json() : []))
      .then((docs) => {
        const doc = docs[0];
        if (!doc?.terms) return;
        const terms = typeof doc.terms === "string" ? JSON.parse(doc.terms) : doc.terms;
        if (Array.isArray(terms)) {
          setItems(flattenTerms(terms));
        }
      })
      .catch(() => {});
  }, [taxonomySlug]);

  return <SelectField name={name} value={value} placeholder="Select..." items={items} />;
}
