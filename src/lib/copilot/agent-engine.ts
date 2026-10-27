// ============================================================
// Agent Engine — handles AI interaction, prompt construction,
// plan parsing, and response generation.
// ============================================================

import type { ChatMessage, AIResponse, ExecutionPlan, ExecutionStep, CopilotContext, CapabilityParam } from "./types";
import type { AIProvider } from "./providers/interface";
import { getAIProvider } from "./providers";
import { buildSystemPrompt } from "./prompts/system-prompt";
import { CAPABILITIES, getCapability } from "./capability-registry";
import { executeReadCapability } from "./execution-engine";
import {
  MAX_READS_PER_ROUND,
  MAX_TOTAL_READS_PER_TURN,
  buildReadSnapshot,
  extractReads,
  renderReadResults,
  validateReads,
  type ReadResult,
} from "./read-protocol";

// ── Prompt Construction ────────────────────────────────────

export function buildMessages(
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

/**
 * Completion ceiling for one reply. 4000 cut replies off mid-sentence once the
 * model had to write a proposal plus a plan. 8192 is DeepSeek's ceiling; a
 * larger model can raise it with COPILOT_MAX_OUTPUT_TOKENS.
 */
const COPILOT_MAX_OUTPUT_TOKENS =
  Number(process.env.COPILOT_MAX_OUTPUT_TOKENS) || 8192;

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
      maxTokens: COPILOT_MAX_OUTPUT_TOKENS,
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

export type StreamEvent = {
  chunk: string;
  plan: ExecutionPlan | null;
  reads?: string[];
  readSnapshot?: unknown | null;
};

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
  let totalReads = 0;
  let budgetNoticeSent = false;
  const allReadResults: ReadResult[] = [];

  for (;;) {
    if (signal?.aborted) return;

    let content = "";
    // A round that asks for data is machine input, not an answer. Its text is
    // held while it can still be a read block, so the block — and a sentence
    // wrapped around it — is never shown or saved. The first character of real
    // prose releases the hold, so an answer still streams token by token; the
    // route clears anything that was released early once a read is confirmed.
    let held: string[] = [];
    let holding = true;
    const release = (): string => {
      const text = held.join("");
      held = [];
      holding = false;
      return text;
    };

    for await (const chunk of provider.streamChat(messages, {
      temperature: 0.3,
      maxTokens: COPILOT_MAX_OUTPUT_TOKENS,
      signal,
    })) {
      if (signal?.aborted) return;
      content += chunk;

      if (holding) {
        const start = content.trimStart();
        // `{` or a fence means a JSON block may be the whole reply; anything
        // else is prose, and the operator should see it as it is written.
        const looksLikeBlock =
          start === "" || start.startsWith("{") || start.startsWith("```");
        if (looksLikeBlock) {
          held.push(chunk);
          continue;
        }
        const buffered = release();
        if (buffered) yield { chunk: buffered, plan: null };
      }
      yield { chunk, plan: null };
    }
    fullContent += content;

    const budgetLeft = MAX_TOTAL_READS_PER_TURN - totalReads;
    const requested =
      readRounds < MAX_READ_ROUNDS && budgetLeft > 0 ? extractReads(content) : [];
    const { valid, refused } = validateReads(
      requested,
      Math.min(MAX_READS_PER_ROUND, Math.max(0, budgetLeft)),
    );

    // The model asked for more data after the budget was spent. Tell it once to
    // answer with what it has — never leave it "waiting", and never let it ask
    // the operator to paste data.
    if (requested.length > 0 && valid.length === 0 && budgetLeft <= 0 && !budgetNoticeSent) {
      budgetNoticeSent = true;
      messages.push({ role: "assistant", content });
      messages.push({
        role: "user",
        content:
          "READ BUDGET REACHED for this reply. Do not request more reads. Answer with what you already have, and say plainly if something is still unknown.",
      });
      readRounds++;
      continue;
    }

    if (valid.length === 0) {
      // Nothing was requested: the held text is the answer. A reply that asked
      // for reads we refused is machine input, and is never printed.
      if (requested.length === 0) {
        const buffered = release();
        if (buffered) yield { chunk: buffered, plan: null };
      }
      break; // No reads requested — this reply is final.
    }
    totalReads += valid.length;

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

    allReadResults.push(...results);

    const refusedNote =
      refused.length > 0
        ? `\n\nREFUSED (unknown or not read-only — do not retry): ${refused.join(", ")}`
        : "";
    messages.push({ role: "assistant", content });
    messages.push({ role: "user", content: renderReadResults(results) + refusedNote });
    readRounds++;
  }

  // After streaming completes, extract plan from full content. A stopped reply
  // never offers one — the plan card is an invitation to execute. The snapshot
  // of everything read this reply travels with the final event so the route can
  // persist it for the next turn; it is not shown to the user.
  if (signal?.aborted) return;

  let plan = extractPlan(fullContent, mode);

  // The reply said what it would do but carried no parseable plan, so the panel
  // has no card and the operator's only move is to say "yes" and wait again.
  // One plan-only follow-up fixes that without touching the prose they already
  // read: it emits no chunks, so there is still one bubble and one card.
  if (!plan && mode === "operations" && looksLikeChangeRequest(userMessage)) {
    plan = await repairPlan(provider, messages, mode, signal);
    if (plan) console.info("[copilot] recovered a plan from a plan-only follow-up");
  }

  yield {
    chunk: "",
    plan,
    readSnapshot: buildReadSnapshot(allReadResults, new Date().toISOString()),
  };
}

/**
 * Verbs that mean "do something" rather than "tell me something".
 *
 * Deliberately shallow: a false positive costs one small non-streaming call that
 * returns `{"plan":null}` and changes nothing. A false negative costs the
 * operator a whole extra turn, which is the complaint this exists to fix.
 */
const CHANGE_INTENT =
  /\b(create|add|make|update|edit|change|set|configure|assign|rename|move|fill|put|upload|enable|disable|archive|restore|remove|delete|replace|apply|fix|correct|generate|provision|publish|switch|turn on|turn off|increase|reduce|adjust)\b/i;

/** A question about how something works is not a request to do it. */
const EXPLANATORY_START = /^\s*(who|what|when|where|why|how|which)\b/i;

export function looksLikeChangeRequest(message: string): boolean {
  if (!message || !CHANGE_INTENT.test(message)) return false;
  return !EXPLANATORY_START.test(message);
}

/**
 * What the follow-up call is asked for. It may answer nothing at all, which is
 * the correct answer to "actually that was a question".
 */
const PLAN_ONLY_INSTRUCTION = `Return ONLY a fenced JSON execution plan for the request above, in the exact format the system prompt specifies. No prose before or after it. If the request is a question, or you cannot plan it without asking the user for more information, return {"plan":null}. Do not repeat or rewrite the reply you already gave.`;

/**
 * One plan-only call. Returns null on anything unexpected: this is a repair, and
 * a failed repair must never replace the answer the operator already has.
 */
async function repairPlan(
  provider: AIProvider,
  messages: ChatMessage[],
  mode: "read_only" | "operations",
  signal?: AbortSignal,
): Promise<ExecutionPlan | null> {
  try {
    const answer = await provider.chat(
      [...messages, { role: "user", content: PLAN_ONLY_INSTRUCTION }],
      { temperature: 0.1, maxTokens: 2000, responseFormat: "json_object", signal },
    );
    return extractPlan(answer.content, mode);
  } catch (err) {
    console.warn(
      "[copilot] plan repair failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
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
