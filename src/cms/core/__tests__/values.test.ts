import { describe, expect, it } from "vitest";

import { fields } from "../define";
import {
  cloneValue,
  createRichTextFromPlainText,
  escapeHtml,
  renderRichText,
  richTextToPlainText,
  serializeFieldValue,
  slugify,
} from "../values";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips diacritics via NFKD normalization", () => {
    expect(slugify("Hyvää Päivää")).toBe("hyvaa-paivaa");
  });

  it("removes special characters", () => {
    expect(slugify("What?! A title: with #symbols")).toBe("what-a-title-with-symbols");
  });

  it("collapses repeated separators", () => {
    expect(slugify("a  -  b___c")).toBe("a-b-c");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("--padded--")).toBe("padded");
  });

  it("returns empty string for symbol-only input", () => {
    expect(slugify("!?#%")).toBe("");
  });
});

describe("escapeHtml", () => {
  it("escapes all HTML-sensitive characters", () => {
    expect(escapeHtml(`<img src="x" onerror='alert(1)'> & more`)).toBe(
      "&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt; &amp; more",
    );
  });

  it("escapes ampersand first (no double escaping)", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("cloneValue", () => {
  it("deep-clones nested structures", () => {
    const original = { a: { b: [1, 2, { c: "x" }] } };
    const clone = cloneValue(original);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.a).not.toBe(original.a);
  });
});

describe("createRichTextFromPlainText", () => {
  it("splits double newlines into paragraphs", () => {
    const doc = createRichTextFromPlainText("First paragraph.\n\nSecond paragraph.");
    expect(doc.type).toBe("root");
    expect(doc.children).toHaveLength(2);
    expect(doc.children[0].type).toBe("paragraph");
  });

  it("drops empty paragraphs", () => {
    const doc = createRichTextFromPlainText("One\n\n\n\nTwo");
    expect(doc.children).toHaveLength(2);
  });
});

describe("renderRichText", () => {
  it("returns empty string for null/invalid documents", () => {
    expect(renderRichText(null)).toBe("");
    expect(renderRichText(undefined)).toBe("");
    expect(renderRichText({ type: "paragraph", children: [] } as never)).toBe("");
  });

  it("renders paragraphs and text", () => {
    const html = renderRichText({
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value: "Hello" }] }],
    });
    expect(html).toBe("<p>Hello</p>");
  });

  it("escapes HTML in text values (XSS)", () => {
    const html = renderRichText({
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value: "<script>alert(1)</script>" }] }],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("applies bold and italic marks", () => {
    const html = renderRichText({
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value: "hi", bold: true, italic: true }] }],
    });
    expect(html).toBe("<p><em><strong>hi</strong></em></p>");
  });

  it("adds target+rel only on external links", () => {
    const external = renderRichText({
      type: "root",
      children: [
        { type: "paragraph", children: [{ type: "text", value: "out", href: "https://example.com" }] },
      ],
    });
    expect(external).toContain('target="_blank" rel="noopener noreferrer"');

    const internal = renderRichText({
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value: "in", href: "/about" }] }],
    });
    expect(internal).not.toContain("target=");
  });

  it("clamps heading levels to 1–6", () => {
    const render = (level: number) =>
      renderRichText({
        type: "root",
        children: [{ type: "heading", level, children: [{ type: "text", value: "h" }] }],
      });
    expect(render(0)).toBe("<h1>h</h1>");
    expect(render(9)).toBe("<h6>h</h6>");
    expect(render(3)).toBe("<h3>h</h3>");
  });

  it("renders local images as <picture> with avif+webp sources", () => {
    const html = renderRichText({
      type: "root",
      children: [{ type: "image", src: "/uploads/photo.jpg", alt: "A photo" }],
    });
    expect(html).toContain("<picture>");
    expect(html).toContain('type="image/avif"');
    expect(html).toContain('type="image/webp"');
    expect(html).toContain('alt="A photo"');
  });

  it("renders external images as plain <img> with escaped attrs", () => {
    const html = renderRichText({
      type: "root",
      children: [{ type: "image", src: 'https://x.com/a.jpg" onerror="alert(1)', alt: "x" }],
    });
    expect(html).not.toContain('onerror="alert');
    expect(html).toContain("&quot;");
  });
});

describe("richTextToPlainText", () => {
  it("flattens nested nodes to text with paragraph breaks", () => {
    const text = richTextToPlainText({
      type: "root",
      children: [
        { type: "paragraph", children: [{ type: "text", value: "One" }] },
        { type: "paragraph", children: [{ type: "text", value: "Two" }] },
      ],
    });
    expect(text).toBe("One\n\nTwo");
  });

  it("returns empty string for empty documents", () => {
    expect(richTextToPlainText(null)).toBe("");
  });
});

describe("serializeFieldValue", () => {
  it("serializes richText to plain text", () => {
    const doc = { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: "Hi" }] }] };
    expect(serializeFieldValue(fields.richText(), doc)).toBe("Hi");
  });

  it("joins arrays with commas", () => {
    expect(serializeFieldValue(fields.array({ of: fields.text() }), ["a", "b"])).toBe("a, b");
  });

  it("stringifies booleans", () => {
    expect(serializeFieldValue(fields.boolean(), true)).toBe("true");
    expect(serializeFieldValue(fields.boolean(), false)).toBe("false");
  });

  it("returns empty string for null/undefined", () => {
    expect(serializeFieldValue(fields.text(), null)).toBe("");
    expect(serializeFieldValue(fields.text(), undefined)).toBe("");
  });
});
