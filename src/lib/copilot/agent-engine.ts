// ============================================================
// Agent Engine — handles AI interaction, prompt construction,
// plan parsing, and response generation.
// ============================================================

import type { ChatMessage, AIResponse, ExecutionPlan, ExecutionStep, CopilotContext, CapabilityParam } from "./types";
import { getAIProvider } from "./providers";
import { buildSystemPrompt } from "./prompts/system-prompt";
import { CAPABILITIES } from "./capability-registry";

// ── Prompt Construction ────────────────────────────────────

function buildMessages(
  context: CopilotContext,
  mode: "read_only" | "operations",
  history: { role: "user" | "assistant"; content: string }[],
  newMessage: string,
): ChatMessage[] {
  const systemPrompt = buildSystemPrompt({
    schoolName: context.schoolName,
    schoolId: context.schoolId,
    mode,
    schoolStats: context.schoolStats,
  });

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Add conversation history (last 20 messages to manage context window)
  const recentHistory = history.slice(-20);
  for (const h of recentHistory) {
    messages.push({ role: h.role, content: h.content });
  }

  // Add the new user message
  messages.push({ role: "user", content: newMessage });

  return messages;
}

// ── AI Chat ────────────────────────────────────────────────

export async function chat(
  context: CopilotContext,
  mode: "read_only" | "operations",
  history: { role: "user" | "assistant"; content: string }[],
  userMessage: string,
): Promise<{ response: string; plan: ExecutionPlan | null }> {
  const provider = getAIProvider();
  const messages = buildMessages(context, mode, history, userMessage);

  let aiResponse: AIResponse;
  try {
    aiResponse = await provider.chat(messages, {
      temperature: 0.3,
      maxTokens: 4000,
    });
  } catch (err: any) {
    throw new Error(`AI provider error: ${err.message}`);
  }

  const content = aiResponse.content;
  const plan = extractPlan(content);

  return { response: content, plan };
}

// ── Streaming Chat ─────────────────────────────────────────

export async function* streamChat(
  context: CopilotContext,
  mode: "read_only" | "operations",
  history: { role: "user" | "assistant"; content: string }[],
  userMessage: string,
): AsyncGenerator<{ chunk: string; plan: ExecutionPlan | null }> {
  const provider = getAIProvider();
  const messages = buildMessages(context, mode, history, userMessage);

  let fullContent = "";

  for await (const chunk of provider.streamChat(messages, {
    temperature: 0.3,
    maxTokens: 4000,
  })) {
    fullContent += chunk;
    yield { chunk, plan: null };
  }

  // After streaming completes, extract plan from full content
  const plan = extractPlan(fullContent);
  if (plan) {
    yield { chunk: "", plan };
  }
}

// ── Plan Extraction ────────────────────────────────────────

function extractPlan(content: string): ExecutionPlan | null {
  // Try to find a JSON plan block in the response
  const jsonBlockRegex = /```json\s*\n?([\s\S]*?)\n?```/g;
  const matches = [...content.matchAll(jsonBlockRegex)];

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.plan && Array.isArray(parsed.plan.steps)) {
        return validateAndNormalizePlan(parsed.plan);
      }
    } catch {
      // Try next match
    }
  }

  // Also try to find a raw JSON object with a "plan" key
  const rawJsonRegex = /\{\s*"plan"\s*:\s*\{/;
  if (rawJsonRegex.test(content)) {
    try {
      // Find the outermost JSON object containing "plan"
      const start = content.indexOf('{"plan"');
      if (start >= 0) {
        let depth = 0;
        let end = start;
        for (let i = start; i < content.length; i++) {
          if (content[i] === "{") depth++;
          if (content[i] === "}") {
            depth--;
            if (depth === 0) {
              end = i + 1;
              break;
            }
          }
        }
        const jsonStr = content.slice(start, end);
        const parsed = JSON.parse(jsonStr);
        if (parsed.plan && Array.isArray(parsed.plan.steps)) {
          return validateAndNormalizePlan(parsed.plan);
        }
      }
    } catch {
      // Couldn't parse plan
    }
  }

  return null;
}

function validateAndNormalizePlan(raw: any): ExecutionPlan | null {
  if (!raw.steps || !Array.isArray(raw.steps) || raw.steps.length === 0) {
    return null;
  }

  const steps: ExecutionStep[] = [];
  const capabilityNames = new Set(CAPABILITIES.map((c) => c.name));

  for (let i = 0; i < raw.steps.length; i++) {
    const s = raw.steps[i];
    if (!s.capability || !capabilityNames.has(s.capability)) {
      // Skip unknown capabilities — AI might hallucinate
      continue;
    }

    steps.push({
      order: s.order ?? i + 1,
      capability: s.capability,
      description: s.description || `Execute ${s.capability}`,
      params: s.params || {},
      dependsOn: s.dependsOn || [],
    });
  }

  if (steps.length === 0) return null;

  return {
    summary: raw.summary || "Execution plan",
    steps,
    estimatedOperations: raw.estimatedOperations ?? steps.length,
    mode: "operations",
    warnings: raw.warnings || [],
  };
}

// ── Plan Validation ────────────────────────────────────────

export function validatePlan(plan: ExecutionPlan): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const capabilityNames = new Set(CAPABILITIES.map((c) => c.name));

  for (const step of plan.steps) {
    // Check capability exists
    if (!capabilityNames.has(step.capability)) {
      errors.push(`Step ${step.order}: Unknown capability "${step.capability}"`);
      continue;
    }

    const cap = CAPABILITIES.find((c) => c.name === step.capability)!;

    // In read-only mode, no write capabilities
    if (plan.mode === "read_only" && !cap.isReadOnly) {
      errors.push(`Step ${step.order}: "${step.capability}" is a write operation but mode is read_only`);
    }

    // Check required params
    if (cap.params) {
      for (const param of cap.params.filter((p: CapabilityParam) => p.required)) {
        if (!(param.name in step.params) || step.params[param.name] === undefined || step.params[param.name] === null) {
          errors.push(`Step ${step.order}: Missing required parameter "${param.name}" for ${step.capability}`);
        }
      }
    }

    // Check dependencies reference valid steps
    if (step.dependsOn) {
      const existingOrders = new Set(plan.steps.map((s) => s.order));
      for (const dep of step.dependsOn) {
        if (!existingOrders.has(dep)) {
          errors.push(`Step ${step.order}: Depends on step ${dep} which doesn't exist`);
        }
        if (dep >= step.order) {
          errors.push(`Step ${step.order}: Cannot depend on step ${dep} (must be earlier)`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
