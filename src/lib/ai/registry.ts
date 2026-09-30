/**
 * Provider registry (Phase 21) — turns configuration rows into routes.
 *
 * WHY CONFIGURATION IS READ, NOT CODED
 * ------------------------------------
 * Which provider serves which capability, and in what order, is a Super Admin
 * decision. It changes on a Tuesday afternoon without a deployment. If the
 * preference order lived in a constant, every change would be a code review and
 * a release, and two environments could disagree about which provider is live
 * while running identical code.
 *
 * WHY THIS READS THROUGH THE SERVICE CLIENT
 * -----------------------------------------
 * `ai_providers` and `ai_provider_models` have RLS enabled with NO policies, on
 * purpose: they are platform configuration, not tenant data, and a tenant token
 * gets zero rows. So these reads MUST use the service client — and they read
 * nothing but configuration. No tenant academic data passes through here.
 *
 * WHY THERE IS NO CACHE
 * ---------------------
 * A cache would mean that disabling a provider — the kill switch for a provider
 * that is misbehaving or burning money — takes effect at some unspecified later
 * moment. The tables hold a handful of rows and the query is indexed; paying one
 * small read per AI call to get an immediate kill switch is the right trade.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AiConfigurationError,
  type AiCapability,
  type AiModelRow,
  type AiProviderRow,
  type AiRoute,
} from "./types";

const PROVIDER_COLUMNS =
  "id, name, label, kind, base_url, api_key_env, is_enabled, priority";
const MODEL_COLUMNS =
  "id, provider_id, capability, model, is_enabled, priority, max_output_tokens";

export async function loadEnabledProviders(supabase: SupabaseClient): Promise<AiProviderRow[]> {
  const { data, error } = await supabase
    .from("ai_providers")
    .select(PROVIDER_COLUMNS)
    .eq("is_enabled", true);

  if (error) {
    throw new AiConfigurationError(`Could not read AI providers: ${error.message}`);
  }
  return (data ?? []) as AiProviderRow[];
}

export async function loadEnabledModels(
  supabase: SupabaseClient,
  capability: AiCapability,
): Promise<AiModelRow[]> {
  const { data, error } = await supabase
    .from("ai_provider_models")
    .select(MODEL_COLUMNS)
    .eq("capability", capability)
    .eq("is_enabled", true);

  if (error) {
    throw new AiConfigurationError(`Could not read AI models: ${error.message}`);
  }
  return (data ?? []) as AiModelRow[];
}

/**
 * Joins providers to models and puts them in the order they should be tried.
 *
 * Pure, and deliberately so: this is the whole of the routing preference, and it
 * is the part that must be provable without a database.
 *
 * A model whose provider is missing or disabled is DROPPED rather than used —
 * disabling a provider must disable its models, not leave them reachable because
 * someone forgot to disable each one.
 *
 * The sort is total. Equal priorities are broken by name and model so the order
 * never depends on the order rows came back in: two calls with the same config
 * must try providers in the same sequence, or the fallback becomes
 * non-deterministic and a failure cannot be reproduced.
 */
export function buildRoutes(providers: AiProviderRow[], models: AiModelRow[]): AiRoute[] {
  const enabled = new Map(
    providers.filter((p) => p.is_enabled).map((p) => [p.id, p] as const),
  );

  const routes: AiRoute[] = [];
  for (const model of models) {
    if (!model.is_enabled) continue;
    const provider = enabled.get(model.provider_id);
    if (!provider) continue;
    routes.push({ provider, model });
  }

  routes.sort((a, b) => {
    if (a.provider.priority !== b.provider.priority) return a.provider.priority - b.provider.priority;
    if (a.model.priority !== b.model.priority) return a.model.priority - b.model.priority;
    if (a.provider.name !== b.provider.name) return a.provider.name < b.provider.name ? -1 : 1;
    if (a.model.model !== b.model.model) return a.model.model < b.model.model ? -1 : 1;
    return 0;
  });

  return routes;
}

/**
 * The routes to try for one capability, most-preferred first.
 *
 * An empty list is not an error here — it is a legitimate state ("AI is off"),
 * and the gateway reports it as `refused_disabled`. Only a failure to READ the
 * configuration is an error.
 */
export async function loadRoutes(
  supabase: SupabaseClient,
  capability: AiCapability,
): Promise<AiRoute[]> {
  const [providers, models] = await Promise.all([
    loadEnabledProviders(supabase),
    loadEnabledModels(supabase, capability),
  ]);
  return buildRoutes(providers, models);
}
