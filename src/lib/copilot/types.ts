// ============================================================
// Copilot Types — shared across the entire copilot module
// ============================================================

// ── AI Provider Types ──────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
  model: string;
}

export interface AIProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<AIResponse>;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json_object";
}

// ── Capability Registry Types ──────────────────────────────

export type CapabilityCategory =
  | "student"
  | "teacher"
  | "class"
  | "subject"
  | "assessment"
  | "grading"
  | "psychomotor"
  | "affective"
  | "session"
  | "term"
  | "report_card"
  | "finance"
  | "school"
  | "publishing"
  | "query"; // read-only queries

export type RollbackStrategy = "reverse_api" | "manual" | "not_supported";

export interface CapabilityParam {
  name: string;
  type: "string" | "number" | "boolean" | "string[]" | "object";
  description: string;
  required: boolean;
}

export interface Capability {
  name: string;
  description: string;
  category: CapabilityCategory;
  endpoint?: string; // undefined for read-only capabilities that combine multiple endpoints
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  params?: CapabilityParam[];
  isReadOnly: boolean;
  rollbackStrategy: RollbackStrategy;
  rollbackDescription?: string;
  dependencies?: string[]; // capability names that must run first
}

// ── Session / Context Types ────────────────────────────────

export interface CopilotContext {
  schoolId: string;
  schoolName: string;
  schoolSlug: string;
  userId: string;
  userEmail: string;
  userRole: "super_admin";
  impersonated: boolean;
  impersonatedBy?: string;
  activeSession?: { id: string; name: string };
  activeTerm?: { id: string; name: string };
  schoolStats?: {
    students: number;
    teachers: number;
    classes: number;
    subjects: number;
  };
}

// ── Conversation Types ─────────────────────────────────────

export interface CopilotConversation {
  id: string;
  school_id: string;
  super_admin_id: string;
  title: string | null;
  mode: "read_only" | "operations";
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

export interface CopilotMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  has_plan: boolean;
  plan_status: "pending" | "approved" | "cancelled" | "executing" | "completed" | "failed" | null;
  plan_summary: ExecutionPlan | null;
  created_at: string;
}

// ── Execution Plan Types ───────────────────────────────────

export interface ExecutionPlan {
  summary: string;
  steps: ExecutionStep[];
  estimatedOperations: number;
  mode: "read_only" | "operations";
  warnings?: string[];
}

export interface ExecutionStep {
  order: number;
  capability: string;
  description: string;
  params: Record<string, unknown>;
  dependsOn?: number[]; // step orders this step depends on
}

// ── Operation Types ────────────────────────────────────────

export interface CopilotOperation {
  id: string;
  conversation_id: string;
  message_id: string;
  school_id: string;
  super_admin_id: string;
  status: "pending" | "approved" | "executing" | "completed" | "failed" | "rolled_back";
  plan_summary: string | null;
  total_steps: number;
  completed_steps: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface OperationStep {
  id: string;
  operation_id: string;
  step_order: number;
  capability: string;
  description: string;
  input_params: Record<string, unknown> | null;
  api_endpoint: string | null;
  api_method: string | null;
  response_data: unknown | null;
  status: "pending" | "running" | "completed" | "failed" | "rolled_back" | "skipped";
  error_message: string | null;
  rollback_info: unknown | null;
  started_at: string | null;
  completed_at: string | null;
}

// ── Chat Request / Response Types ──────────────────────────

export interface ChatRequest {
  conversationId?: string;
  schoolId: string;
  message: string;
  mode: "read_only" | "operations";
}

export interface ChatResponse {
  conversationId: string;
  message: CopilotMessage;
  plan?: ExecutionPlan;
  error?: string;
}

// ── Execute Request / Response ─────────────────────────────

export interface ExecuteRequest {
  operationId: string;
}

export interface ExecuteResponse {
  operation: CopilotOperation;
  steps: OperationStep[];
  summary: string;
  error?: string;
}

// ── Progress / Status ──────────────────────────────────────

export interface OperationStatus {
  operation: CopilotOperation;
  steps: OperationStep[];
}

// ── Audit Types ────────────────────────────────────────────

export interface CopilotAuditEntry {
  id: string;
  school_id: string;
  super_admin_id: string;
  operation_id: string | null;
  step_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}
