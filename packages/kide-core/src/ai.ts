import { streamText } from "ai";

import { getStorage, readEnv } from "./runtime";

export function isAiEnabled(): boolean {
  return !!(readEnv("AI_PROVIDER") && readEnv("AI_API_KEY"));
}

export async function getAiModel() {
  const provider = readEnv("AI_PROVIDER") || "openai";
  const modelName = readEnv("AI_MODEL") || "gpt-4o-mini";

  if (provider === "openai") {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({ apiKey: readEnv("AI_API_KEY") });
    return openai(modelName);
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
}

export async function streamAltText(imageUrl: string, filename: string) {
  const model = await getAiModel();
  const image = await getStorage().getFile(imageUrl);
  if (!image) {
    throw new Error(`Image not found: ${imageUrl}`);
  }

  return streamText({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            image: new Uint8Array(image),
          },
          {
            type: "text",
            text: `Generate a concise, descriptive alt text for this image (filename: ${filename}). The alt text should be suitable for accessibility purposes. Return only the alt text, no quotes or extra formatting.`,
          },
        ],
      },
    ],
  });
}

export async function streamSeoDescription(content: { title: string; excerpt?: string; body?: string }) {
  const model = await getAiModel();
  const prompt = `Generate an SEO-optimized meta description (max 155 characters) for a page with the following content. Return only the description, no quotes or extra formatting.

Title: ${content.title}
${content.excerpt ? `Excerpt: ${content.excerpt}` : ""}
${content.body ? `Body preview: ${content.body.substring(0, 500)}` : ""}`;

  return streamText({ model, prompt });
}

export async function streamTranslation(content: {
  text: string;
  sourceLocale: string;
  targetLocale: string;
  fieldName: string;
  fieldType: "text" | "richText" | "slug";
}) {
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

  return streamText({ model, prompt });
}
