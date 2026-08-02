// ============================================================
// AI Provider Interface — abstraction for LLM providers
// ============================================================

import type { ChatMessage, AIResponse, ChatOptions } from "../types";

export interface AIProvider {
  /** Send a chat completion request to the LLM */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<AIResponse>;
  /** Stream a chat completion — yields content chunks */
  streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string, void, undefined>;
}

/** Error thrown when the AI provider fails */
export class AIProviderError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "AIProviderError";
    this.statusCode = statusCode;
  }
}
