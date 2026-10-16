import { AdminCard } from "../../components/AdminCard";
import type { ReverseRef } from "../../lib/edit-data";

export function ReverseReferencesList({
  reverseRefs,
  variant = "editorial",
  title = "Referenced by",
}: {
  reverseRefs: ReverseRef[];
  variant?: "editorial" | "record";
  title?: string;
}) {
  const allDocs = reverseRefs.flatMap((ref) =>
    ref.docs.map((d) => ({ ...d, collectionSlug: ref.collectionSlug, collectionLabel: ref.collectionLabel })),
  );
  if (allDocs.length === 0) return null;
  const visible = allDocs.slice(0, 30);
  const hidden = allDocs.slice(30);

  const list = (
    <>
      <ul className="grid gap-1">
        {visible.map((d) => (
          <li key={`${d.collectionSlug}:${d._id}`} className="flex min-w-0 items-baseline gap-2 lg:justify-between">
            <a
              href={`/admin/${d.collectionSlug}/${d._id}`}
              target="_blank"
              className="text-foreground/70 hover:text-foreground truncate text-sm transition-colors hover:underline"
            >
              {d.label}
            </a>
            <span className="text-muted-foreground shrink-0 text-xs">{d.collectionLabel}</span>
          </li>
        ))}
      </ul>
      {hidden.length > 0 && (
        <details className="mt-2">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs transition-colors">
            Show {hidden.length} more
          </summary>
          <ul className="mt-1 grid gap-1">
            {hidden.map((d) => (
              <li key={`${d.collectionSlug}:${d._id}`} className="flex min-w-0 items-baseline gap-2 lg:justify-between">
                <a
                  href={`/admin/${d.collectionSlug}/${d._id}`}
                  className="text-foreground/70 hover:text-foreground truncate text-sm transition-colors hover:underline"
                >
                  {d.label}
                </a>
                <span className="text-muted-foreground shrink-0 text-xs">{d.collectionLabel}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );

  return variant === "record" ? (
    <AdminCard title={title}>{list}</AdminCard>
  ) : (
    <div className="grid gap-2">
      <span className="text-foreground/80 text-sm leading-none font-medium">{title}</span>
      {list}
    </div>
  );
}
