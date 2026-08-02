// ============================================================
// Provider Factory — instantiates the appropriate AI provider
// ============================================================

import { DeepSeekProvider } from "./deepseek-provider";
import type { AIProvider } from "./interface";

export function getAIProvider(): AIProvider {
  // Currently only DeepSeek is supported.
  // To add another provider (OpenAI, Anthropic, etc.), add a
  // case here and implement its adapter class.
  return new DeepSeekProvider();
}
