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

type OpenAITokenUsage = {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
  total_tokens?: unknown;
};

/**
 * Logs token usage without logging prompts, responses, audio, or images.
 * Chat completions use prompt_tokens/completion_tokens; transcription and
 * image responses use input_tokens/output_tokens in the installed SDK.
 */
export function logOpenAIUsage(
  operation: string,
  requestedModel: string,
  usage: unknown,
  responseModel?: string | null,
) {
  const tokenUsage =
    usage && typeof usage === "object" ? (usage as OpenAITokenUsage) : {};
  const inputTokens =
    typeof tokenUsage.input_tokens === "number"
      ? tokenUsage.input_tokens
      : typeof tokenUsage.prompt_tokens === "number"
        ? tokenUsage.prompt_tokens
        : null;
  const outputTokens =
    typeof tokenUsage.output_tokens === "number"
      ? tokenUsage.output_tokens
      : typeof tokenUsage.completion_tokens === "number"
        ? tokenUsage.completion_tokens
        : null;
  const totalTokens =
    typeof tokenUsage.total_tokens === "number"
      ? tokenUsage.total_tokens
      : null;

  console.info("[OpenAI token usage]", {
    operacao: operation,
    modelo: responseModel ?? requestedModel,
    tokensEntrada: inputTokens,
    tokensSaida: outputTokens,
    tokensTotal: totalTokens,
  });
}
