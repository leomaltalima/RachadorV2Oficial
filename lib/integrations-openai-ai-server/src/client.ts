import OpenAI from "openai";

const directOpenAiApiKey = process.env.OPENAI_API_KEY?.trim().replace(/\s+/g, "");
const managedOpenAiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const openAiApiKey = directOpenAiApiKey ?? managedOpenAiApiKey;
const openAiBaseUrl =
  process.env.OPENAI_BASE_URL ??
  (directOpenAiApiKey
    ? "https://api.openai.com/v1"
    : process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1");

if (!openAiApiKey) {
  throw new Error(
    "Configure OPENAI_API_KEY or provision the OpenAI AI integration before using AI features.",
  );
}

export const openai = new OpenAI({
  apiKey: openAiApiKey,
  baseURL: openAiBaseUrl,
});

/** True when the app is using a user-provided OpenAI key instead of Replit AI Integrations. */
export const isUsingDirectOpenAI = Boolean(directOpenAiApiKey);
