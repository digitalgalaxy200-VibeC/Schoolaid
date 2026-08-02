// ============================================================
// DeepSeek Provider — OpenAI-compatible chat completions API
// ============================================================

import type { ChatMessage, AIResponse, ChatOptions } from "../types";
import { AIProviderError, type AIProvider } from "./interface";

const DEEPSEEK_BASE = "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL = "deepseek-chat";

export class DeepSeekProvider implements AIProvider {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.DEEPSEEK_API_KEY || "";
    if (!this.apiKey) {
      throw new AIProviderError(
        "DEEPSEEK_API_KEY is not configured. Please add it to your environment variables.",
        500,
      );
    }
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<AIResponse> {
    const body: Record<string, unknown> = {
      model: DEEPSEEK_MODEL,
      max_tokens: options?.maxTokens ?? 4000,
      temperature: options?.temperature ?? 0.3,
      messages,
    };

    if (options?.responseFormat === "json_object") {
      body.response_format = { type: "json_object" };
    }

    const resp = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      throw new AIProviderError(
        `DeepSeek API error ${resp.status}: ${errBody.slice(0, 500)}`,
        resp.status,
      );
    }

    const json = await resp.json();
    const raw = json?.choices?.[0]?.message?.content;
    if (!raw) {
      throw new AIProviderError("DeepSeek returned an empty response", 502);
    }

    return {
      content: raw,
      usage: json.usage
        ? {
            promptTokens: json.usage.prompt_tokens,
            completionTokens: json.usage.completion_tokens,
          }
        : undefined,
      model: json.model || DEEPSEEK_MODEL,
    };
  }

  async *streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string, void, undefined> {
    const body: Record<string, unknown> = {
      model: DEEPSEEK_MODEL,
      max_tokens: options?.maxTokens ?? 4000,
      temperature: options?.temperature ?? 0.3,
      messages,
      stream: true,
    };

    if (options?.responseFormat === "json_object") {
      body.response_format = { type: "json_object" };
    }

    const resp = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      throw new AIProviderError(
        `DeepSeek API error ${resp.status}: ${errBody.slice(0, 500)}`,
        resp.status,
      );
    }

    const reader = resp.body?.getReader();
    if (!reader) throw new AIProviderError("No response body for streaming", 502);

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed?.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // skip unparseable chunks
        }
      }
    }
  }
}
