import { NextResponse } from "next/server";
import { verifySuperAdmin } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { ValidationErrors, bool, number, oneOf, text, uuid } from "@/lib/validate";

/**
 * Super Admin AI provider configuration.
 *
 * WHY THE SERVICE CLIENT IS REQUIRED
 * ----------------------------------
 * `ai_providers` and `ai_provider_models` are platform configuration: RLS is
 * enabled with no policies, so a tenant-scoped client reads zero rows. The Super
 * Admin screens reach them through the service client, exactly like
 * `components_rows`.
 *
 * THE KEY IS NEVER RETURNED
 * -------------------------
 * `api_key_env` holds the NAME of an environment variable, never the key. The
 * only thing this route says about the key is `key_configured`: whether an env
 * var of that name exists on the server. "This provider is switched on but has
 * no key" is the single most useful fact on the screen, and it is the most this
 * route should ever reveal.
 *
 * ONE PUT, TWO SHAPES
 * -------------------
 * The screen edits providers and their models, and a provider is only meaningful
 * through its models, so both updates live behind one endpoint. The body decides
 * which: `provider_id` targets a provider, `model_id` a model. They are mutually
 * exclusive; sending both is a client bug, not a merge.
 */

type AiProviderRow = {
  id: string;
  name: string;
  label: string;
  kind: string;
  base_url: string;
  api_key_env: string;
  is_enabled: boolean;
  priority: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type AiProviderModelRow = {
  id: string;
  provider_id: string;
  capability: string;
  model: string;
  is_enabled: boolean;
  priority: number;
  max_output_tokens: number | null;
  created_at: string;
};

/** The four capabilities a model can serve; the DB check allows exactly these. */
const CAPABILITIES = ["text", "vision", "speech_to_text", "text_to_speech"] as const;

/** GET — every provider with its models nested, plus `key_configured`. */
export async function GET(request: Request) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  const [providersResult, modelsResult] = await Promise.all([
    supabase
      .from("ai_providers")
      .select("*")
      .order("priority", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("ai_provider_models")
      .select("*")
      .order("priority", { ascending: true })
      .order("model", { ascending: true }),
  ]);

  if (providersResult.error) {
    return NextResponse.json({ error: providersResult.error.message }, { status: 500 });
  }
  if (modelsResult.error) {
    return NextResponse.json({ error: modelsResult.error.message }, { status: 500 });
  }

  const providers = (providersResult.data ?? []) as AiProviderRow[];
  const models = (modelsResult.data ?? []) as AiProviderModelRow[];

  const modelsByProvider = new Map<string, AiProviderModelRow[]>();
  for (const model of models) {
    const existing = modelsByProvider.get(model.provider_id);
    if (existing) existing.push(model);
    else modelsByProvider.set(model.provider_id, [model]);
  }

  return NextResponse.json({
    providers: providers.map((provider) => ({
      ...provider,
      key_configured: Boolean(process.env[provider.api_key_env]),
      models: modelsByProvider.get(provider.id) ?? [],
    })),
  });
}

/** Shared by provider create and update: https:// only, and a real env-var name. */
function readBaseUrl(body: unknown, errors: ValidationErrors, required = false): string | null {
  const value = text(body, "base_url", errors, { required, max: 500 });
  if (value === null) return null;
  if (!value.startsWith("https://")) {
    errors.add("base_url", "must start with https://");
    return null;
  }
  return value;
}

function readApiKeyEnv(body: unknown, errors: ValidationErrors, required = false): string | null {
  const value = text(body, "api_key_env", errors, { required, max: 100 });
  if (value === null) return null;
  if (!/^[A-Z][A-Z0-9_]*$/.test(value)) {
    errors.add("api_key_env", "must be an environment variable name, e.g. DEEPSEEK_API_KEY");
    return null;
  }
  return value;
}

/**
 * `max_output_tokens` is the one nullable field: an explicit null clears the cap
 * while an absent key leaves it untouched. `number()` reads both as absent, so
 * the raw value is inspected to tell them apart.
 */
function readMaxOutputTokens(
  body: unknown,
  errors: ValidationErrors,
): { present: boolean; value: number | null } {
  const raw = body && typeof body === "object"
    ? (body as Record<string, unknown>).max_output_tokens
    : undefined;
  if (raw === undefined) return { present: false, value: null };
  if (raw === null) return { present: true, value: null };
  return {
    present: true,
    value: number(body, "max_output_tokens", errors, { integer: true, min: 1 }),
  };
}

/** Turn a provider update body into a patch, accumulating validation errors. */
function providerPatch(body: unknown, errors: ValidationErrors): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  const isEnabled = bool(body, "is_enabled", errors);
  if (isEnabled !== null) patch.is_enabled = isEnabled;

  const priority = number(body, "priority", errors, { integer: true, min: 0, max: 1000 });
  if (priority !== null) patch.priority = priority;

  const label = text(body, "label", errors, { max: 200 });
  if (label !== null) patch.label = label;

  const baseUrl = readBaseUrl(body, errors);
  if (baseUrl !== null) patch.base_url = baseUrl;

  const apiKeyEnv = readApiKeyEnv(body, errors);
  if (apiKeyEnv !== null) patch.api_key_env = apiKeyEnv;

  return patch;
}

/** Turn a model update body into a patch, accumulating validation errors. */
function modelPatch(body: unknown, errors: ValidationErrors): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  const isEnabled = bool(body, "is_enabled", errors);
  if (isEnabled !== null) patch.is_enabled = isEnabled;

  const priority = number(body, "priority", errors, { integer: true, min: 0, max: 1000 });
  if (priority !== null) patch.priority = priority;

  const model = text(body, "model", errors, { max: 200 });
  if (model !== null) patch.model = model;

  const maxTokens = readMaxOutputTokens(body, errors);
  if (maxTokens.present) patch.max_output_tokens = maxTokens.value;

  return patch;
}

/**
 * A failed write. A unique-constraint violation is a user mistake with a clear
 * remedy (renaming a model onto an existing name), so it is a 400 with a readable
 * message rather than a 500 or a crash.
 */
function saveFailure(error: { code?: string; message: string }, subject: "provider" | "model") {
  if (error.code === "23505") {
    return NextResponse.json(
      {
        error:
          subject === "model"
            ? "A model with that name already exists for this provider and capability."
            : "A provider with that name already exists.",
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ error: error.message }, { status: 500 });
}

/** PUT — update one provider or one model, whichever the body identifies. */
export async function PUT(request: Request) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  }

  const errors = new ValidationErrors();
  const providerId = uuid(body, "provider_id", errors);
  const modelId = uuid(body, "model_id", errors);

  if (providerId && modelId) {
    return NextResponse.json(
      { error: "Provide either provider_id or model_id, not both." },
      { status: 400 },
    );
  }

  if (!providerId && !modelId) {
    return NextResponse.json(
      { error: errors.ok ? "A provider_id or model_id is required." : errors.summary() },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();

  if (providerId) {
    const patch = providerPatch(body, errors);
    if (!errors.ok) return NextResponse.json({ error: errors.summary() }, { status: 400 });
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("ai_providers")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", providerId)
      .select()
      .maybeSingle();

    if (error) return saveFailure(error, "provider");
    if (!data) return NextResponse.json({ error: "Provider not found." }, { status: 404 });

    const row = data as AiProviderRow;
    return NextResponse.json({
      ...row,
      key_configured: Boolean(process.env[row.api_key_env]),
    });
  }

  // Unreachable after the guards above, but it makes the narrowing explicit.
  if (!modelId) {
    return NextResponse.json({ error: "A provider_id or model_id is required." }, { status: 400 });
  }

  const patch = modelPatch(body, errors);
  if (!errors.ok) return NextResponse.json({ error: errors.summary() }, { status: 400 });
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ai_provider_models")
    .update(patch)
    .eq("id", modelId)
    .select()
    .maybeSingle();

  if (error) return saveFailure(error, "model");
  if (!data) return NextResponse.json({ error: "Model not found." }, { status: 404 });

  return NextResponse.json(data);
}

/**
 * POST — create a provider, or a model under an existing provider.
 *
 * The presence of `provider_id` decides which: with it, a model for that
 * provider; without it, a new provider. A new provider is always
 * `openai_compatible`, because that one adapter covers every provider the
 * gateway can currently reach — `kind` is not a choice the screen offers.
 */
export async function POST(request: Request) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  }

  const errors = new ValidationErrors();
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const hasProviderId =
    raw.provider_id !== undefined && raw.provider_id !== null && raw.provider_id !== "";

  const supabase = getServiceClient();

  if (hasProviderId) {
    const providerId = uuid(body, "provider_id", errors);
    const capability = oneOf(body, "capability", CAPABILITIES, errors, { required: true });
    const model = text(body, "model", errors, { required: true, max: 200 });
    const priority = number(body, "priority", errors, { integer: true, min: 0, max: 1000 });
    const isEnabled = bool(body, "is_enabled", errors);
    const maxTokens = readMaxOutputTokens(body, errors);

    if (!errors.ok) return NextResponse.json({ error: errors.summary() }, { status: 400 });
    if (!providerId || !capability || !model) {
      return NextResponse.json(
        { error: "provider_id, capability and model are required." },
        { status: 400 },
      );
    }

    const { data: provider, error: providerError } = await supabase
      .from("ai_providers")
      .select("id")
      .eq("id", providerId)
      .maybeSingle();
    if (providerError) return NextResponse.json({ error: providerError.message }, { status: 500 });
    if (!provider) return NextResponse.json({ error: "Provider not found." }, { status: 404 });

    const insert: Record<string, unknown> = { provider_id: providerId, capability, model };
    if (priority !== null) insert.priority = priority;
    if (isEnabled !== null) insert.is_enabled = isEnabled;
    if (maxTokens.present) insert.max_output_tokens = maxTokens.value;

    const { data, error } = await supabase
      .from("ai_provider_models")
      .insert(insert)
      .select()
      .single();
    if (error) return saveFailure(error, "model");

    return NextResponse.json(data, { status: 201 });
  }

  const name = text(body, "name", errors, { required: true, max: 100 });
  if (name !== null && !/^[a-z][a-z0-9_]*$/.test(name)) {
    errors.add("name", "must be a lowercase slug, e.g. gemini");
  }
  const label = text(body, "label", errors, { required: true, max: 200 });
  const baseUrl = readBaseUrl(body, errors, true);
  const apiKeyEnv = readApiKeyEnv(body, errors, true);
  const priority = number(body, "priority", errors, { integer: true, min: 0, max: 1000 });
  const isEnabled = bool(body, "is_enabled", errors);
  const notes = text(body, "notes", errors, { max: 1000 });

  if (!errors.ok) return NextResponse.json({ error: errors.summary() }, { status: 400 });
  if (!name || !label || !baseUrl || !apiKeyEnv) {
    return NextResponse.json(
      { error: "name, label, base_url and api_key_env are required." },
      { status: 400 },
    );
  }

  const insert: Record<string, unknown> = {
    name,
    label,
    kind: "openai_compatible",
    base_url: baseUrl,
    api_key_env: apiKeyEnv,
  };
  if (priority !== null) insert.priority = priority;
  if (isEnabled !== null) insert.is_enabled = isEnabled;
  if (notes !== null) insert.notes = notes;

  const { data, error } = await supabase.from("ai_providers").insert(insert).select().single();
  if (error) return saveFailure(error, "provider");

  const row = data as AiProviderRow;
  return NextResponse.json(
    { ...row, key_configured: Boolean(process.env[row.api_key_env]), models: [] },
    { status: 201 },
  );
}
