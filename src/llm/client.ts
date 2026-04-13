// OpenRouter LLM client — native fetch, no SDK required.
// OpenRouter is OpenAI-compatible: https://openrouter.ai/api/v1
//
// Model format: "anthropic/claude-sonnet-4-6", "openai/gpt-4o", "google/gemini-2-flash", etc.
// Any model on https://openrouter.ai/models works — just change the model string in config.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCallOptions {
  model: string;
  apiKey: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  baseUrl?: string;
}

interface OpenRouterResponse {
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

async function fetchWithRetry(url: string, options: RequestInit, timeoutMs = 30_000): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok || !RETRYABLE.has(res.status) || attempt === MAX_RETRIES) return res;
      const delay = BASE_DELAY * Math.pow(2, attempt);
      console.warn(`[llm] Retrying after ${delay}ms (attempt ${attempt + 1}, status ${res.status})`);
      await new Promise(r => setTimeout(r, delay));
    } catch (err: unknown) {
      clearTimeout(timer);
      if (attempt === MAX_RETRIES) throw err;
      const delay = BASE_DELAY * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

function truncatePrompt(prompt: string, maxChars = 40_000): string {
  if (prompt.length <= maxChars) return prompt;
  const half = maxChars / 2;
  return prompt.slice(0, half) + '\n\n[... truncated ...]\n\n' + prompt.slice(-half);
}

// Send a chat completion request to OpenRouter.
// Returns the assistant reply text.
// Throws on HTTP error or malformed response.
export async function chatCompletion(opts: LLMCallOptions): Promise<string> {
  const baseUrl = opts.baseUrl ?? 'https://openrouter.ai/api/v1';
  const url = `${baseUrl}/chat/completions`;

  // Truncate oversized user messages to avoid context length errors
  const messages = opts.messages.map(m => ({
    ...m,
    content: m.role === 'user' ? truncatePrompt(m.content) : m.content,
  }));

  const body = {
    model: opts.model,
    messages,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.2,
  };

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/onyx',
      'X-Title': 'ONYX',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '(no body)');
    throw new Error(`OpenRouter ${res.status}: ${errorText}`);
  }

  const data = await res.json() as OpenRouterResponse;
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== 'string') {
    throw new Error(`OpenRouter: unexpected response shape: ${JSON.stringify(data).slice(0, 300)}`);
  }

  return content;
}
