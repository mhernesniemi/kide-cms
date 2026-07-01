import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ComponentType } from "react";
import { Heading2, Heading3, List, ListOrdered, Quote, Blocks, Link2, type LucideProps } from "lucide-react";
import { cn } from "../lib/utils";
import { insertBlockNode, SHARED_BLOCK_TYPE } from "./content-block-spec";
import { blankBlockFields, humanize, type BlockTypesMeta } from "./block-fields";

export type SharedSectionOption = { id: string; title: string; blockType: string; status?: string };

// -----------------------------------------------
// Slash command — Notion/Gutenberg-style "/" inserter for headings, lists, quotes
// and the content field's component blocks.
// -----------------------------------------------

type SlashItem = {
  title: string;
  subtitle: string;
  icon: ComponentType<LucideProps>;
  run: (editor: Editor, range: Range) => void;
};

const buildItems = (types: BlockTypesMeta, sharedSections: SharedSectionOption[], query: string): SlashItem[] => {
  const formatting: SlashItem[] = [
    {
      title: "Heading 2",
      subtitle: "Section heading",
      icon: Heading2,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 2 }).run(),
    },
    {
      title: "Heading 3",
      subtitle: "Subsection heading",
      icon: Heading3,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 3 }).run(),
    },
    {
      title: "Bullet list",
      subtitle: "Unordered list",
      icon: List,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
    },
    {
      title: "Numbered list",
      subtitle: "Ordered list",
      icon: ListOrdered,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
    },
    {
      title: "Quote",
      subtitle: "Blockquote",
      icon: Quote,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
    },
  ];

  const blocks: SlashItem[] = Object.keys(types).map((typeName) => ({
    title: humanize(typeName),
    subtitle: "Component block",
    icon: Blocks,
    run: (e, r) => insertBlockNode(e, typeName, blankBlockFields(types[typeName] ?? {}), r),
  }));

  const shared: SlashItem[] = sharedSections.map((section) => ({
    title: section.title,
    subtitle: `Shared section · ${humanize(section.blockType)}`,
    icon: Link2,
    run: (e, r) =>
      insertBlockNode(e, SHARED_BLOCK_TYPE, { ref: section.id, title: section.title, blockType: section.blockType }, r),
  }));

  const all = [...formatting, ...blocks, ...shared];
  const q = query.trim().toLowerCase();
  return q ? all.filter((item) => item.title.toLowerCase().includes(q)) : all;
};

// -----------------------------------------------
// Menu component
// -----------------------------------------------

type SlashMenuRef = { onKeyDown: (props: { event: KeyboardEvent }) => boolean };

type SlashMenuProps = {
  items: SlashItem[];
  command: (item: SlashItem) => void;
};

const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>(({ items, command }, ref) => {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSelected(0), [items]);

  // Keep the highlighted item visible when the list is height-constrained and scrolls.
  useEffect(() => {
    (listRef.current?.children[selected] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelected((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelected((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        if (items[selected]) command(items[selected]);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="bg-popover text-muted-foreground w-64 rounded-md border p-2 text-sm shadow-md">No matches</div>
    );
  }

  return (
    <div ref={listRef} className="bg-popover max-h-72 w-64 overflow-y-auto rounded-md border p-1 shadow-md">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            key={item.title}
            type="button"
            onMouseEnter={() => setSelected(index)}
            onClick={() => command(item)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
              index === selected ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/60",
            )}
          >
            <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded border">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{item.title}</span>
              <span className="text-muted-foreground block truncate text-xs">{item.subtitle}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
});
SlashMenu.displayName = "SlashMenu";

// -----------------------------------------------
// Extension
// -----------------------------------------------

type SlashCommandOptions = { types: BlockTypesMeta; sharedSections: SharedSectionOption[] };

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return { types: {}, sharedSections: [] };
  },

  addProseMirrorPlugins() {
    const suggestion: Omit<SuggestionOptions<SlashItem>, "editor"> = {
      char: "/",
      startOfLine: false,
      allowSpaces: false,
      command: ({ editor, range, props }) => props.run(editor, range),
      items: ({ query }) => buildItems(this.options.types, this.options.sharedSections, query),
      render: () => {
        let component: ReactRenderer<SlashMenuRef, SlashMenuProps> | null = null;

        const place = (clientRect?: (() => DOMRect | null) | null) => {
          const rect = clientRect?.();
          if (!rect || !component) return;
          const el = component.element as HTMLElement;
          const menu = el.firstElementChild as HTMLElement | null;
          el.style.position = "fixed";
          el.style.zIndex = "50";
          el.style.left = `${rect.left}px`;

          const margin = 8;
          const gap = 6;
          const vh = window.innerHeight;
          const spaceBelow = vh - rect.bottom - margin;
          const spaceAbove = rect.top - margin;
          const MAX = 288; // matches max-h-72
          const needed = Math.min(menu?.scrollHeight || MAX, MAX);

          // Open downward when it fits or there's more room below; otherwise flip above.
          if (spaceBelow >= needed || spaceBelow >= spaceAbove) {
            el.style.top = `${rect.bottom + gap}px`;
            el.style.bottom = "auto";
            if (menu) menu.style.maxHeight = `${Math.max(Math.min(needed, spaceBelow), 0)}px`;
          } else {
            el.style.top = "auto";
            el.style.bottom = `${vh - rect.top + gap}px`;
            if (menu) menu.style.maxHeight = `${Math.max(Math.min(needed, spaceAbove), 0)}px`;
          }
        };

        // Measure after paint so the menu's rendered height (scrollHeight) is accurate.
        const position = (clientRect?: (() => DOMRect | null) | null) => requestAnimationFrame(() => place(clientRect));

        return {
          onStart: (props) => {
            component = new ReactRenderer(SlashMenu, {
              props: { items: props.items, command: (item: SlashItem) => props.command(item) },
              editor: props.editor,
            });
            document.body.appendChild(component.element);
            position(props.clientRect);
          },
          onUpdate: (props) => {
            component?.updateProps({ items: props.items, command: (item: SlashItem) => props.command(item) });
            position(props.clientRect);
          },
          onKeyDown: (props) => {
            if (props.event.key === "Escape") {
              component?.element.remove();
              component?.destroy();
              component = null;
              return true;
            }
            return component?.ref?.onKeyDown(props) ?? false;
          },
          onExit: () => {
            component?.element.remove();
            component?.destroy();
            component = null;
          },
        };
      },
    };

    return [Suggestion({ editor: this.editor, ...suggestion })];
  },
});
