// ---------------------------------------------------------------------------
// LLM (OpenAI-compatible) configuration — fully env-driven for portability.
//
// The app talks to any OpenAI-compatible /chat/completions endpoint. Nothing
// about the hosting provider is hardcoded here: set these env vars to point at
// your own provider (OpenAI, Azure OpenAI, Together, a self-hosted vLLM, etc.):
//
//   LLM_BASE_URL   e.g. https://api.openai.com/v1   (no trailing /chat/completions)
//   LLM_API_KEY    your provider API key
//   LLM_MODEL      e.g. gpt-4o  (a model your provider actually serves)
//
// Backward compatibility: if LLM_API_KEY is unset we fall back to the legacy
// ABACUSAI_API_KEY so existing deployments keep working without edits.
// ---------------------------------------------------------------------------

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** True when both a base URL and an API key are available. */
  configured: boolean;
}

export function getLlmConfig(): LlmConfig {
  const baseUrl = (process.env.LLM_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = process.env.LLM_API_KEY || process.env.ABACUSAI_API_KEY || '';
  const model = process.env.LLM_MODEL || 'gpt-4o';
  return { baseUrl, apiKey, model, configured: Boolean(baseUrl && apiKey) };
}

/** Full chat-completions URL for a given base URL. */
export function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}
