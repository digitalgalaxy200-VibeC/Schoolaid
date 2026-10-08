// ============================================================
// Agent Engine — handles AI interaction, prompt construction,
// plan parsing, and response generation.
// ============================================================

import type { ChatMessage, AIResponse, ExecutionPlan, ExecutionStep, CopilotContext, CapabilityParam } from "./types";
import { getAIProvider } from "./providers";
import { buildSystemPrompt } from "./prompts/system-prompt";
import { CAPABILITIES, getCapability } from "./capability-registry";
import { executeReadCapability } from "./execution-engine";
import {
  extractReads,
  renderReadResults,
  validateReads,
  type ReadResult,
} from "./read-protocol";

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
    allSchools: context.allSchools,
    activeSession: context.activeSession,
    activeTerm: context.activeTerm,
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
  const plan = extractPlan(content, mode);

  return { response: content, plan };
}

/** How many times one reply may ask for data before it must answer. */
const MAX_READ_ROUNDS = 3;

export type StreamEvent = { chunk: string; plan: ExecutionPlan | null; reads?: string[] };

// ── Streaming Chat ─────────────────────────────────────────

/**
 * Streams one reply, pausing for READ ROUNDS when the model asks for data.
 *
 * The model cannot see the database, so it may request reads with a fenced
 * {"reads":[...]} block. Each request is filtered to read-only capabilities,
 * executed on the existing read path, fenced as untrusted data and handed
 * back — then the model continues. Writes still go nowhere until a human
 * approves a plan. `reads` events are yielded so the route can audit them and
 * the panel can show what is being looked up.
 *
 * `signal` is the Super Admin's Stop button. Aborting it ends the reply where
 * it stands: no further chunks, no read round, and — deliberately — no plan,
 * because a plan extracted from a half-written reply is a plan nobody reviewed.
 */
export async function* streamChat(
  context: CopilotContext,
  mode: "read_only" | "operations",
  history: { role: "user" | "assistant"; content: string }[],
  userMessage: string,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const provider = getAIProvider();
  const messages = buildMessages(context, mode, history, userMessage);

  let fullContent = "";
  let readRounds = 0;

  for (;;) {
    if (signal?.aborted) return;

    let content = "";
    for await (const chunk of provider.streamChat(messages, {
      temperature: 0.3,
      maxTokens: 4000,
      signal,
    })) {
      if (signal?.aborted) return;
      content += chunk;
      yield { chunk, plan: null };
    }
    fullContent += content;

    const requested = readRounds < MAX_READ_ROUNDS ? extractReads(content) : [];
    const { valid, refused } = validateReads(requested);
    if (valid.length === 0) break; // No reads requested — this reply is final.

    // Nothing more is worth reading once the person has stopped asking.
    if (signal?.aborted) return;

    const results: ReadResult[] = [];
    const capabilities: string[] = [];
    for (const read of valid) {
      capabilities.push(read.capability);
      const capability = getCapability(read.capability);
      if (!context.schoolId && capability?.endpoint !== "/api/super-admin/schools") {
        results.push({
          capability: read.capability,
          error: "No school is selected. Ask the user to choose a school in the panel first.",
        });
        continue;
      }
      try {
        const data = await executeReadCapability(read.capability, read.params, context.schoolId);
        results.push({ capability: read.capability, data });
      } catch (err) {
        results.push({
          capability: read.capability,
          error: err instanceof Error ? err.message : "the read failed",
        });
      }
    }

    yield { chunk: "", plan: null, reads: capabilities };

    if (signal?.aborted) return;

    const refusedNote =
      refused.length > 0
        ? `\n\nREFUSED (unknown or not read-only — do not retry): ${refused.join(", ")}`
        : "";
    messages.push({ role: "assistant", content });
    messages.push({ role: "user", content: renderReadResults(results) + refusedNote });
    readRounds++;
  }

  // After streaming completes, extract plan from full content. A stopped reply
  // never offers one — the plan card is an invitation to execute.
  if (signal?.aborted) return;
  const plan = extractPlan(fullContent, mode);
  if (plan) {
    yield { chunk: "", plan };
  }
}

// ── Plan Extraction ────────────────────────────────────────

export function extractPlan(
  content: string,
  mode: "read_only" | "operations" = "operations",
): ExecutionPlan | null {
  // Try to find a JSON plan block in the response
  const jsonBlockRegex = /```json\s*\n?([\s\S]*?)\n?```/g;
  const matches = [...content.matchAll(jsonBlockRegex)];

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.plan && Array.isArray(parsed.plan.steps)) {
        return validateAndNormalizePlan(parsed.plan, mode);
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
          return validateAndNormalizePlan(parsed.plan, mode);
        }
      }
    } catch {
      // Couldn't parse plan
    }
  }

  return null;
}

function validateAndNormalizePlan(
  raw: any,
  mode: "read_only" | "operations",
): ExecutionPlan | null {
  if (!raw.steps || !Array.isArray(raw.steps) || raw.steps.length === 0) {
    return null;
  }

  const steps: ExecutionStep[] = [];

  for (let i = 0; i < raw.steps.length; i++) {
    const s = raw.steps[i] ?? {};
    const capability =
      typeof s.capability === "string" ? s.capability : String(s.capability ?? "");

    // An unknown capability is RETAINED, not dropped. Dropping it would let the
    // plan look smaller and cleaner than the model actually asked for, and the
    // model could believe a step ran when it was silently discarded. Keeping it
    // means `validatePlan` fails the whole plan with an explicit reason, and the
    // execute gate refuses it before anything runs.
    steps.push({
      order: s.order ?? i + 1,
      capability,
      description: s.description || `Execute ${capability || "unknown capability"}`,
      params: s.params || {},
      dependsOn: s.dependsOn || [],
    });
  }

  if (steps.length === 0) return null;

  return {
    summary: raw.summary || "Execution plan",
    steps,
    estimatedOperations: raw.estimatedOperations ?? steps.length,
    // The mode the plan was GENERATED under travels with it, so the execute
    // route can refuse a write plan produced in Read-Only mode instead of
    // trusting the prompt to have prevented it.
    mode,
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
