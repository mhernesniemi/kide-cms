import { Fragment, type ReactNode } from "react";
import { ChevronRight, GripVertical } from "lucide-react";
import { humanize, type BlockTypesMeta, type SubFieldMeta } from "./block-fields";
import { SHARED_BLOCK_TYPE } from "./content-block-spec";

// What a Tiptap field shows until the editor mounts in the browser: the stored value
// drawn with the editor's own classes, so loading the editor doesn't shift the page.

type Node = { type: string; [key: string]: unknown };

const children = (node: Node) => (Array.isArray(node.children) ? (node.children as Node[]) : []);

const renderText = (node: Node, key: number): ReactNode => {
  const lines = String(node.value ?? "").split("\n");
  let content: ReactNode = lines.flatMap((line, i) => (i === 0 ? [line] : [<br key={i} />, line]));
  if (node.bold) content = <strong>{content}</strong>;
  if (node.italic) content = <em>{content}</em>;
  if (node.href) content = <span className="text-primary underline">{content}</span>;
  return <Fragment key={key}>{content}</Fragment>;
};

const renderNode = (node: Node, key: number): ReactNode => {
  const inner = children(node).map(renderNode);
  switch (node.type) {
    case "text":
      return renderText(node, key);
    case "paragraph":
      return <p key={key}>{inner}</p>;
    case "heading":
      return Number(node.level) === 3 ? <h3 key={key}>{inner}</h3> : <h2 key={key}>{inner}</h2>;
    case "list":
      return node.ordered ? <ol key={key}>{inner}</ol> : <ul key={key}>{inner}</ul>;
    case "list-item":
      return <li key={key}>{inner}</li>;
    case "quote":
      return <blockquote key={key}>{inner}</blockquote>;
    case "image":
      return (
        <img key={key} src={String(node.src ?? "")} alt={String(node.alt ?? "")} className="max-w-full rounded-lg" />
      );
    default:
      return null;
  }
};

const blockPreview = (fields: Record<string, unknown>, meta: Record<string, SubFieldMeta>) => {
  for (const [key, field] of Object.entries(meta)) {
    if (field.type === "text" && fields[key]) {
      const text = String(fields[key]);
      return text.length > 60 ? text.slice(0, 60) + "..." : text;
    }
  }
  return "";
};

function StaticBlock({ node, types }: { node: Node; types: BlockTypesMeta }) {
  const blockType = String(node.blockType ?? "");
  const fields = (node.fields ?? {}) as Record<string, unknown>;
  const isShared = blockType === SHARED_BLOCK_TYPE;
  const preview = isShared ? String(fields.title ?? "Shared section") : blockPreview(fields, types[blockType] ?? {});
  return (
    <div className="bg-card my-3 overflow-hidden rounded-lg border">
      <div className="bg-muted-strong/50 flex items-center gap-2 px-3 py-2">
        <span className="text-muted-foreground/50 -ml-1 rounded p-1">
          <GripVertical className="size-4" />
        </span>
        <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        <span className="bg-card text-secondary-foreground rounded border px-2 py-0.5 text-xs font-medium">
          {isShared ? "Shared" : humanize(blockType)}
        </span>
        {preview && <span className="text-foreground/70 min-w-0 truncate text-sm">{preview}</span>}
        <div className="h-7" />
      </div>
    </div>
  );
}

export function StaticEditorContent({
  value,
  className,
  style,
  types,
}: {
  value: string;
  className: string;
  style: React.CSSProperties;
  types?: BlockTypesMeta;
}) {
  let doc: Node | null = null;
  try {
    doc = JSON.parse(value);
  } catch {}
  const nodes = doc?.type === "root" ? children(doc) : [];
  return (
    <div className={className} style={style} aria-busy="true">
      {nodes.map((node, i) =>
        node.type === "block" ? types ? <StaticBlock key={i} node={node} types={types} /> : null : renderNode(node, i),
      )}
    </div>
  );
}
