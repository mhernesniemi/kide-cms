import { generateText } from "ai";

export function isAiEnabled(): boolean {
  const provider = process.env.AI_PROVIDER;
  const apiKey = process.env.AI_API_KEY;
  return !!(provider && apiKey);
}

export async function getAiModel() {
  const provider = process.env.AI_PROVIDER || "openai";
  const modelName = process.env.AI_MODEL || "gpt-4o-mini";

  if (provider === "openai") {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({ apiKey: process.env.AI_API_KEY });
    return openai(modelName);
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
}

export async function generateAltText(imageUrl: string, filename: string): Promise<string> {
  const model = await getAiModel();

  const { text } = await generateText({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            image: new URL(imageUrl, process.env.SITE_URL || "http://localhost:4321"),
          },
          {
            type: "text",
            text: `Generate a concise, descriptive alt text for this image (filename: ${filename}). The alt text should be suitable for accessibility purposes. Return only the alt text, no quotes or extra formatting.`,
          },
        ],
      },
    ],
  });

  return text.trim();
}

export async function generateSeoMetadata(content: {
  title: string;
  excerpt?: string;
  body?: string;
  field: "seoTitle" | "seoDescription";
}): Promise<string> {
  const model = await getAiModel();

  const prompt =
    content.field === "seoTitle"
      ? `Generate an SEO-optimized page title (max 60 characters) for a page with the following content. Return only the title, no quotes or extra formatting.

Title: ${content.title}
${content.excerpt ? `Excerpt: ${content.excerpt}` : ""}
${content.body ? `Body preview: ${content.body.substring(0, 500)}` : ""}`
      : `Generate an SEO-optimized meta description (max 155 characters) for a page with the following content. Return only the description, no quotes or extra formatting.

Title: ${content.title}
${content.excerpt ? `Excerpt: ${content.excerpt}` : ""}
${content.body ? `Body preview: ${content.body.substring(0, 500)}` : ""}`;

  const { text } = await generateText({
    model,
    prompt,
  });

  return text.trim();
}

export async function generateTranslation(content: {
  text: string;
  sourceLocale: string;
  targetLocale: string;
  fieldName: string;
  fieldType: "text" | "richText" | "slug";
}): Promise<string> {
  const model = await getAiModel();

  let prompt: string;

  if (content.fieldType === "richText") {
    prompt = `Translate the following rich text JSON AST from ${content.sourceLocale} to ${content.targetLocale}. Keep the exact same JSON structure, only translate the text values. Return only the valid JSON, no extra formatting or code blocks.

${content.text}`;
  } else if (content.fieldType === "slug") {
    prompt = `Translate and create a URL-friendly slug in ${content.targetLocale} based on this ${content.sourceLocale} text: "${content.text}". Return only the slug (lowercase, hyphens instead of spaces, no special characters).`;
  } else {
    prompt = `Translate the following text from ${content.sourceLocale} to ${content.targetLocale}. Return only the translated text, no quotes or extra formatting.

${content.text}`;
  }

  const { text } = await generateText({
    model,
    prompt,
  });

  return text.trim();
}
