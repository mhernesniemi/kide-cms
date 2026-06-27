import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { forwardRef, useEffect, useImperativeHandle, useState, type ComponentType } from "react";
import { Heading2, Heading3, List, ListOrdered, Quote, Blocks, type LucideProps } from "lucide-react";
import { cn } from "../lib/utils";
import { insertBlockNode } from "./content-block-spec";
import { blankBlockFields, humanize, type BlockTypesMeta } from "./block-fields";

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

const buildItems = (types: BlockTypesMeta, query: string): SlashItem[] => {
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

  const all = [...formatting, ...blocks];
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

  useEffect(() => setSelected(0), [items]);

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
    <div className="bg-popover max-h-72 w-64 overflow-y-auto rounded-md border p-1 shadow-md">
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

type SlashCommandOptions = { types: BlockTypesMeta };

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return { types: {} };
  },

  addProseMirrorPlugins() {
    const suggestion: Omit<SuggestionOptions<SlashItem>, "editor"> = {
      char: "/",
      startOfLine: false,
      allowSpaces: false,
      command: ({ editor, range, props }) => props.run(editor, range),
      items: ({ query }) => buildItems(this.options.types, query),
      render: () => {
        let component: ReactRenderer<SlashMenuRef, SlashMenuProps> | null = null;

        const position = (clientRect?: (() => DOMRect | null) | null) => {
          const rect = clientRect?.();
          if (!rect || !component) return;
          const el = component.element as HTMLElement;
          el.style.position = "fixed";
          el.style.left = `${rect.left}px`;
          el.style.top = `${rect.bottom + 6}px`;
          el.style.zIndex = "50";
        };

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
