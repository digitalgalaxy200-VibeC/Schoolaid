"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Input } from "@/components/ui";
import { AI_FEATURE_KEY } from "@/lib/ai/features";

/**
 * Super Admin → AI Settings.
 *
 * Two questions, two sections:
 *   A. Which services can serve AI, and in what order?  (platform config)
 *   B. Which schools may use AI at all?                 (per-school entitlement)
 *
 * The second is the master switch the AI gateway enforces. It is per-school and
 * defaults to deny: no row means no AI. This screen only writes rows, it does not
 * decide what AI does — that is the gateway's job.
 */

type ProviderModel = {
  id: string;
  provider_id: string;
  capability: string;
  model: string;
  is_enabled: boolean;
  priority: number;
  max_output_tokens: number | null;
  created_at: string;
};

type Provider = {
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
  key_configured: boolean;
  models: ProviderModel[];
};

type School = {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string | null;
  subscription_status: string;
  is_archived: boolean;
  created_at: string;
};

type FeatureRow = {
  school_id: string;
  feature_key: string;
  is_enabled: boolean;
};

type ProviderDraft = { priority: string; base_url: string; api_key_env: string };
type ModelDraft = { priority: string; model: string; max_output_tokens: string };
type AddProviderDraft = { name: string; label: string; base_url: string; api_key_env: string };
type AddModelDraft = { capability: string; model: string; priority: string };
type Banner = { type: "success" | "error"; text: string };

const CAPABILITY_ORDER = ["text", "vision", "speech_to_text", "text_to_speech"] as const;
const CAPABILITY_LABELS: Record<string, string> = {
  text: "Text",
  vision: "Images (vision)",
  speech_to_text: "Voice to text",
  text_to_speech: "Text to speech",
};

function providerDraft(provider: Pick<Provider, "priority" | "base_url" | "api_key_env">): ProviderDraft {
  return {
    priority: String(provider.priority),
    base_url: provider.base_url,
    api_key_env: provider.api_key_env,
  };
}

function modelDraft(model: Pick<ProviderModel, "priority" | "model" | "max_output_tokens">): ModelDraft {
  return {
    priority: String(model.priority),
    model: model.model,
    max_output_tokens: model.max_output_tokens === null ? "" : String(model.max_output_tokens),
  };
}

function capabilityGroups(provider: Provider) {
  return CAPABILITY_ORDER
    .map((capability) => ({
      capability,
      label: CAPABILITY_LABELS[capability] ?? capability,
      models: provider.models.filter((model) => model.capability === capability),
    }))
    .filter((group) => group.models.length > 0);
}

function errorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object" && "error" in data) {
    return String((data as { error: unknown }).error);
  }
  return `Request failed (${status}).`;
}

async function sendAi(
  method: "POST" | "PUT",
  body: unknown,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/super-admin/ai/providers", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: errorMessage(data, res.status) };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Network error — the change was not saved." };
  }
}

function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${checked ? "bg-success" : "bg-border"} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "left-5" : "left-0.5"}`}
      />
    </button>
  );
}

export default function AiSettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [featureMap, setFeatureMap] = useState<Record<string, boolean>>({});
  const [providerDrafts, setProviderDrafts] = useState<Record<string, ProviderDraft>>({});
  const [modelDrafts, setModelDrafts] = useState<Record<string, ModelDraft>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [featurePending, setFeaturePending] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);

  // "Add" forms are revealed on demand, not left expanded as clutter.
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [addProviderDraft, setAddProviderDraft] = useState<AddProviderDraft>({
    name: "",
    label: "",
    base_url: "",
    api_key_env: "",
  });
  const [addProviderError, setAddProviderError] = useState<string | null>(null);
  const [addingProvider, setAddingProvider] = useState(false);
  // One provider's "add model" form can be open at a time.
  const [addingModelFor, setAddingModelFor] = useState<string | null>(null);
  const [addModelDraft, setAddModelDraft] = useState<AddModelDraft>({
    capability: "text",
    model: "",
    priority: "100",
  });
  const [addModelError, setAddModelError] = useState<string | null>(null);
  const [addingModel, setAddingModel] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [providersRes, schoolsRes, featuresRes] = await Promise.all([
          fetch("/api/super-admin/ai/providers"),
          fetch("/api/super-admin/schools"),
          fetch("/api/super-admin/features"),
        ]);

        const providersData: unknown = await providersRes.json().catch(() => null);
        const schoolsData: unknown = await schoolsRes.json().catch(() => null);
        const featuresData: unknown = await featuresRes.json().catch(() => null);

        if (!providersRes.ok) throw new Error(errorMessage(providersData, providersRes.status));
        if (!schoolsRes.ok) throw new Error(errorMessage(schoolsData, schoolsRes.status));
        if (!featuresRes.ok) throw new Error(errorMessage(featuresData, featuresRes.status));

        if (cancelled) return;

        const providerPayload = providersData as { providers?: Provider[] } | null;
        const providerList = Array.isArray(providerPayload?.providers)
          ? providerPayload.providers
          : [];
        setProviders(providerList);

        const nextProviderDrafts: Record<string, ProviderDraft> = {};
        const nextModelDrafts: Record<string, ModelDraft> = {};
        for (const provider of providerList) {
          nextProviderDrafts[provider.id] = providerDraft(provider);
          for (const model of provider.models) nextModelDrafts[model.id] = modelDraft(model);
        }
        setProviderDrafts(nextProviderDrafts);
        setModelDrafts(nextModelDrafts);

        setSchools(Array.isArray(schoolsData) ? (schoolsData as School[]) : []);

        const nextFeatureMap: Record<string, boolean> = {};
        (Array.isArray(featuresData) ? (featuresData as FeatureRow[]) : []).forEach((feature) => {
          if (feature.feature_key === AI_FEATURE_KEY) {
            nextFeatureMap[feature.school_id] = feature.is_enabled;
          }
        });
        setFeatureMap(nextFeatureMap);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Could not load AI settings.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const markPending = (id: string, on: boolean) => {
    setPending((prev) => {
      const next = { ...prev };
      if (on) next[id] = true;
      else delete next[id];
      return next;
    });
  };

  const isPending = (id: string) => Boolean(pending[id]);

  /** Merge the authoritative server row back in, keeping the nested models. */
  const applyProviderRow = (row: Provider) => {
    setProviders((list) =>
      list.map((provider) =>
        provider.id === row.id ? { ...provider, ...row, models: provider.models } : provider,
      ),
    );
    setProviderDrafts((drafts) => ({ ...drafts, [row.id]: providerDraft(row) }));
  };

  const applyModelRow = (row: ProviderModel) => {
    setProviders((list) =>
      list.map((provider) =>
        provider.id === row.provider_id
          ? { ...provider, models: provider.models.map((m) => (m.id === row.id ? row : m)) }
          : provider,
      ),
    );
    setModelDrafts((drafts) => ({ ...drafts, [row.id]: modelDraft(row) }));
  };

  const toggleProvider = async (provider: Provider) => {
    const next = !provider.is_enabled;
    const before = providers;
    setProviders((list) =>
      list.map((p) => (p.id === provider.id ? { ...p, is_enabled: next } : p)),
    );
    markPending(provider.id, true);
    const result = await sendAi("PUT", { provider_id: provider.id, is_enabled: next });
    markPending(provider.id, false);
    if (!result.ok) {
      setProviders(before);
      setBanner({ type: "error", text: result.error });
      return;
    }
    applyProviderRow(result.data as Provider);
  };

  const toggleModel = async (provider: Provider, model: ProviderModel) => {
    const next = !model.is_enabled;
    const before = providers;
    setProviders((list) =>
      list.map((p) =>
        p.id === provider.id
          ? { ...p, models: p.models.map((m) => (m.id === model.id ? { ...m, is_enabled: next } : m)) }
          : p,
      ),
    );
    markPending(model.id, true);
    const result = await sendAi("PUT", { model_id: model.id, is_enabled: next });
    markPending(model.id, false);
    if (!result.ok) {
      setProviders(before);
      setBanner({ type: "error", text: result.error });
      return;
    }
    applyModelRow(result.data as ProviderModel);
  };

  const saveProvider = async (provider: Provider) => {
    const draft = providerDrafts[provider.id];
    if (!draft) return;

    const priority = Number(draft.priority);
    if (!Number.isInteger(priority) || priority < 0 || priority > 1000) {
      setBanner({ type: "error", text: "Priority must be a whole number from 0 to 1000." });
      return;
    }
    const baseUrl = draft.base_url.trim();
    if (!baseUrl.startsWith("https://")) {
      setBanner({ type: "error", text: "Base URL must start with https://." });
      return;
    }
    const apiKeyEnv = draft.api_key_env.trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(apiKeyEnv)) {
      setBanner({
        type: "error",
        text: "API key variable must look like DEEPSEEK_API_KEY: capital letters, digits and underscores, starting with a letter.",
      });
      return;
    }

    const patch = { priority, base_url: baseUrl, api_key_env: apiKeyEnv };
    const before = providers;
    setProviders((list) => list.map((p) => (p.id === provider.id ? { ...p, ...patch } : p)));
    markPending(provider.id, true);
    const result = await sendAi("PUT", { provider_id: provider.id, ...patch });
    markPending(provider.id, false);
    if (!result.ok) {
      setProviders(before);
      setBanner({ type: "error", text: result.error });
      return;
    }
    applyProviderRow(result.data as Provider);
    setBanner({ type: "success", text: `${provider.label} saved.` });
  };

  const saveModel = async (provider: Provider, model: ProviderModel) => {
    const draft = modelDrafts[model.id];
    if (!draft) return;

    const priority = Number(draft.priority);
    if (!Number.isInteger(priority) || priority < 0 || priority > 1000) {
      setBanner({ type: "error", text: "Priority must be a whole number from 0 to 1000." });
      return;
    }
    const name = draft.model.trim();
    if (!name) {
      setBanner({ type: "error", text: "Model name is required." });
      return;
    }
    const rawMax = draft.max_output_tokens.trim();
    let maxOutputTokens: number | null = null;
    if (rawMax !== "") {
      const value = Number(rawMax);
      if (!Number.isInteger(value) || value < 1) {
        setBanner({
          type: "error",
          text: "Max output tokens must be a positive whole number, or left empty for no cap.",
        });
        return;
      }
      maxOutputTokens = value;
    }

    const patch = { priority, model: name, max_output_tokens: maxOutputTokens };
    const before = providers;
    setProviders((list) =>
      list.map((p) =>
        p.id === provider.id
          ? { ...p, models: p.models.map((m) => (m.id === model.id ? { ...m, ...patch } : m)) }
          : p,
      ),
    );
    markPending(model.id, true);
    const result = await sendAi("PUT", { model_id: model.id, ...patch });
    markPending(model.id, false);
    if (!result.ok) {
      setProviders(before);
      setBanner({ type: "error", text: result.error });
      return;
    }
    applyModelRow(result.data as ProviderModel);
    setBanner({ type: "success", text: `${name} saved.` });
  };

  const toggleSchoolAi = async (school: School) => {
    const next = !featureMap[school.id];
    const before = featureMap[school.id] === true;
    setFeatureMap((map) => ({ ...map, [school.id]: next }));
    setFeaturePending(school.id);
    try {
      const res = await fetch("/api/super-admin/features", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_id: school.id,
          feature_key: AI_FEATURE_KEY,
          is_enabled: next,
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(data, res.status));
      setBanner({
        type: "success",
        text: next ? `AI is now on for ${school.name}.` : `AI is now off for ${school.name}.`,
      });
    } catch (err) {
      setFeatureMap((map) => ({ ...map, [school.id]: before }));
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Could not change this school's AI access.",
      });
    } finally {
      setFeaturePending(null);
    }
  };

  const applyNewProvider = (provider: Provider) => {
    setProviders((list) => [...list, provider]);
    setProviderDrafts((drafts) => ({ ...drafts, [provider.id]: providerDraft(provider) }));
  };

  const applyNewModel = (model: ProviderModel) => {
    setProviders((list) =>
      list.map((provider) =>
        provider.id === model.provider_id
          ? { ...provider, models: [...provider.models, model] }
          : provider,
      ),
    );
    setModelDrafts((drafts) => ({ ...drafts, [model.id]: modelDraft(model) }));
  };

  const createProvider = async () => {
    const name = addProviderDraft.name.trim();
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      setAddProviderError("Name must be a lowercase slug such as gemini.");
      return;
    }
    const label = addProviderDraft.label.trim();
    if (!label) {
      setAddProviderError("Label is required.");
      return;
    }
    const baseUrl = addProviderDraft.base_url.trim();
    if (!baseUrl.startsWith("https://")) {
      setAddProviderError("Base URL must start with https://.");
      return;
    }
    const apiKeyEnv = addProviderDraft.api_key_env.trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(apiKeyEnv)) {
      setAddProviderError("API key variable must look like GEMINI_API_KEY.");
      return;
    }

    setAddingProvider(true);
    setAddProviderError(null);
    const result = await sendAi("POST", { name, label, base_url: baseUrl, api_key_env: apiKeyEnv });
    setAddingProvider(false);
    if (!result.ok) {
      setAddProviderError(result.error);
      return;
    }
    applyNewProvider(result.data as Provider);
    setAddProviderDraft({ name: "", label: "", base_url: "", api_key_env: "" });
    setShowAddProvider(false);
    setBanner({ type: "success", text: `${label} added. It starts switched off.` });
  };

  const createModel = async (provider: Provider) => {
    const modelName = addModelDraft.model.trim();
    if (!modelName) {
      setAddModelError("Model name is required.");
      return;
    }
    const priority = Number(addModelDraft.priority);
    if (!Number.isInteger(priority) || priority < 0 || priority > 1000) {
      setAddModelError("Priority must be a whole number from 0 to 1000.");
      return;
    }

    setAddingModel(true);
    setAddModelError(null);
    const result = await sendAi("POST", {
      provider_id: provider.id,
      capability: addModelDraft.capability,
      model: modelName,
      priority,
    });
    setAddingModel(false);
    if (!result.ok) {
      setAddModelError(result.error);
      return;
    }
    applyNewModel(result.data as ProviderModel);
    setAddModelDraft({ capability: "text", model: "", priority: "100" });
    setAddingModelFor(null);
    setBanner({ type: "success", text: `${modelName} added. It starts switched off.` });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 font-bold">AI Settings</h1>
        <p className="text-caption text-text-secondary mt-1">
          Which services provide AI, and which schools may use it.
        </p>
      </div>

      {banner && (
        <Card
          variant="default"
          padding="sm"
          className={banner.type === "success" ? "bg-success-bg border-success" : "bg-error-bg border-error"}
        >
          <p className={`text-caption ${banner.type === "success" ? "text-success" : "text-error"}`}>
            {banner.text}
          </p>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : loadError ? (
        <Card variant="default" padding="sm" className="bg-error-bg border-error">
          <p className="text-caption text-error">{loadError}</p>
        </Card>
      ) : (
        <>
          {/* ── Section A — providers and their models ── */}
          <Card
            variant="default"
            header={
              <div>
                <h2 className="text-h2 font-bold">AI providers</h2>
                <p className="text-caption text-text-secondary mt-1">
                  Lower priority is tried first. If a provider fails, the next one on the list is
                  tried automatically — that is how a text request and an image request can be
                  served by different providers.
                </p>
              </div>
            }
          >
            {providers.length === 0 ? (
              <p className="text-caption text-text-secondary">No providers are configured.</p>
            ) : (
              <div className="space-y-4">
                {providers.map((provider) => {
                  const draft = providerDrafts[provider.id];
                  if (!draft) return null;
                  return (
                    <div key={provider.id} className="border border-border rounded-lg p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-body">{provider.label}</span>
                            <span className="font-mono text-caption text-text-secondary">
                              {provider.name}
                            </span>
                            {!provider.key_configured && (
                              <Badge variant="warning">API key not set</Badge>
                            )}
                          </div>
                          {provider.notes && (
                            <p className="text-caption text-text-secondary mt-1">{provider.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-caption text-text-secondary">
                            {provider.is_enabled ? "On" : "Off"}
                          </span>
                          <Toggle
                            checked={provider.is_enabled}
                            disabled={isPending(provider.id)}
                            onChange={() => toggleProvider(provider)}
                            label={`Turn ${provider.label} ${provider.is_enabled ? "off" : "on"}`}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 tablet:grid-cols-6 gap-3 mt-4">
                        <div className="tablet:col-span-1">
                          <Input
                            label="Priority"
                            type="number"
                            min={0}
                            max={1000}
                            value={draft.priority}
                            onChange={(e) =>
                              setProviderDrafts((d) => ({
                                ...d,
                                [provider.id]: { ...d[provider.id], priority: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div className="tablet:col-span-3">
                          <Input
                            label="Base URL"
                            value={draft.base_url}
                            onChange={(e) =>
                              setProviderDrafts((d) => ({
                                ...d,
                                [provider.id]: { ...d[provider.id], base_url: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div className="tablet:col-span-2">
                          <Input
                            label="API key env var"
                            value={draft.api_key_env}
                            hint="Name of the server variable holding the key"
                            onChange={(e) =>
                              setProviderDrafts((d) => ({
                                ...d,
                                [provider.id]: { ...d[provider.id], api_key_env: e.target.value },
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 mt-3">
                        <Button
                          size="sm"
                          onClick={() => saveProvider(provider)}
                          loading={isPending(provider.id)}
                        >
                          Save
                        </Button>
                        <span className="text-caption text-text-secondary">
                          Key{" "}
                          {provider.key_configured
                            ? "is set on the server."
                            : "is NOT set on the server."}
                        </span>
                      </div>

                      <div className="mt-5 space-y-4">
                        {capabilityGroups(provider).map((group) => (
                          <div key={group.capability}>
                            <h3 className="text-caption font-semibold uppercase tracking-wide text-text-secondary mb-2">
                              {group.label}
                            </h3>
                            <div className="space-y-3">
                              {group.models.map((model) => {
                                const modelDraftValue = modelDrafts[model.id];
                                if (!modelDraftValue) return null;
                                return (
                                  <div
                                    key={model.id}
                                    className="bg-clay rounded-lg border border-border p-3"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-caption text-text-secondary">
                                        {model.is_enabled ? "Enabled" : "Disabled"}
                                      </span>
                                      <Toggle
                                        checked={model.is_enabled}
                                        disabled={isPending(model.id)}
                                        onChange={() => toggleModel(provider, model)}
                                        label={`Turn ${model.model} ${model.is_enabled ? "off" : "on"}`}
                                      />
                                    </div>

                                    <div className="grid grid-cols-1 tablet:grid-cols-6 gap-3 mt-3">
                                      <div className="tablet:col-span-1">
                                        <Input
                                          label="Priority"
                                          type="number"
                                          min={0}
                                          max={1000}
                                          value={modelDraftValue.priority}
                                          onChange={(e) =>
                                            setModelDrafts((d) => ({
                                              ...d,
                                              [model.id]: { ...d[model.id], priority: e.target.value },
                                            }))
                                          }
                                        />
                                      </div>
                                      <div className="tablet:col-span-3">
                                        <Input
                                          label="Model"
                                          value={modelDraftValue.model}
                                          onChange={(e) =>
                                            setModelDrafts((d) => ({
                                              ...d,
                                              [model.id]: { ...d[model.id], model: e.target.value },
                                            }))
                                          }
                                        />
                                      </div>
                                      <div className="tablet:col-span-2">
                                        <Input
                                          label="Max output tokens"
                                          type="number"
                                          min={1}
                                          value={modelDraftValue.max_output_tokens}
                                          hint="Blank means no cap"
                                          onChange={(e) =>
                                            setModelDrafts((d) => ({
                                              ...d,
                                              [model.id]: {
                                                ...d[model.id],
                                                max_output_tokens: e.target.value,
                                              },
                                            }))
                                          }
                                        />
                                      </div>
                                    </div>

                                    <div className="mt-3">
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => saveModel(provider, model)}
                                        loading={isPending(model.id)}
                                      >
                                        Save
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        {provider.models.length === 0 && (
                          <p className="text-caption text-text-secondary">
                            No models are configured for this provider.
                          </p>
                        )}
                      </div>

                      <div className="mt-3">
                        {addingModelFor !== provider.id ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setAddingModelFor(provider.id);
                              setAddModelDraft({ capability: "text", model: "", priority: "100" });
                              setAddModelError(null);
                            }}
                          >
                            Add model
                          </Button>
                        ) : (
                          <div className="border border-border rounded-lg p-3 space-y-3">
                            <div className="grid grid-cols-1 tablet:grid-cols-6 gap-3">
                              <div className="tablet:col-span-2">
                                <label
                                  htmlFor={`capability-${provider.id}`}
                                  className="block text-caption font-medium text-text-primary mb-1.5"
                                >
                                  Capability
                                </label>
                                <select
                                  id={`capability-${provider.id}`}
                                  value={addModelDraft.capability}
                                  onChange={(e) =>
                                    setAddModelDraft((d) => ({ ...d, capability: e.target.value }))
                                  }
                                  className="w-full h-[42px] px-3.5 text-body bg-surface border border-border rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                >
                                  {CAPABILITY_ORDER.map((capability) => (
                                    <option key={capability} value={capability}>
                                      {CAPABILITY_LABELS[capability]}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="tablet:col-span-2">
                                <Input
                                  label="Model"
                                  value={addModelDraft.model}
                                  onChange={(e) =>
                                    setAddModelDraft((d) => ({ ...d, model: e.target.value }))
                                  }
                                />
                              </div>
                              <div className="tablet:col-span-2">
                                <Input
                                  label="Priority"
                                  type="number"
                                  min={0}
                                  max={1000}
                                  value={addModelDraft.priority}
                                  onChange={(e) =>
                                    setAddModelDraft((d) => ({ ...d, priority: e.target.value }))
                                  }
                                />
                              </div>
                            </div>
                            {addModelError && (
                              <p className="text-caption text-error">{addModelError}</p>
                            )}
                            <p className="text-caption text-text-secondary">
                              New models start switched off.
                            </p>
                            <div className="flex gap-3">
                              <Button
                                size="sm"
                                onClick={() => createModel(provider)}
                                loading={addingModel}
                              >
                                Add model
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setAddingModelFor(null);
                                  setAddModelError(null);
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className={providers.length === 0 ? "mt-4" : "mt-5 border-t border-border pt-4"}>
              {!showAddProvider ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowAddProvider(true);
                    setAddProviderError(null);
                  }}
                >
                  Add provider
                </Button>
              ) : (
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <h3 className="text-caption font-semibold uppercase tracking-wide text-text-secondary">
                    New provider
                  </h3>
                  <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
                    <Input
                      label="Name (slug)"
                      value={addProviderDraft.name}
                      hint="Lowercase, e.g. gemini"
                      onChange={(e) =>
                        setAddProviderDraft((d) => ({ ...d, name: e.target.value }))
                      }
                    />
                    <Input
                      label="Label"
                      value={addProviderDraft.label}
                      onChange={(e) =>
                        setAddProviderDraft((d) => ({ ...d, label: e.target.value }))
                      }
                    />
                    <Input
                      label="Base URL"
                      value={addProviderDraft.base_url}
                      hint="Must start with https://"
                      onChange={(e) =>
                        setAddProviderDraft((d) => ({ ...d, base_url: e.target.value }))
                      }
                    />
                    <Input
                      label="API key env var"
                      value={addProviderDraft.api_key_env}
                      hint="e.g. GEMINI_API_KEY"
                      onChange={(e) =>
                        setAddProviderDraft((d) => ({ ...d, api_key_env: e.target.value }))
                      }
                    />
                  </div>
                  {addProviderError && (
                    <p className="text-caption text-error">{addProviderError}</p>
                  )}
                  <p className="text-caption text-text-secondary">
                    New providers start switched off.
                  </p>
                  <div className="flex gap-3">
                    <Button size="sm" onClick={createProvider} loading={addingProvider}>
                      Add provider
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowAddProvider(false);
                        setAddProviderError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* ── Section B — per-school entitlement ── */}
          <Card
            variant="default"
            header={
              <div>
                <h2 className="text-h2 font-bold">Schools with AI access</h2>
                <p className="text-caption text-text-secondary mt-1">
                  A school with this off cannot use AI at all. Access is denied by default: no row
                  means no AI until it is granted here.
                </p>
              </div>
            }
          >
            {schools.length === 0 ? (
              <p className="text-caption text-text-secondary">No schools.</p>
            ) : (
              <div className="divide-y divide-border">
                {schools.map((school) => (
                  <div key={school.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-body truncate">{school.name}</p>
                      <p className="text-caption text-text-secondary truncate">
                        /{school.slug} · {school.subscription_status}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-caption text-text-secondary">
                        {featureMap[school.id] ? "On" : "Off"}
                      </span>
                      <Toggle
                        checked={Boolean(featureMap[school.id])}
                        disabled={featurePending === school.id}
                        onChange={() => toggleSchoolAi(school)}
                        label={`Allow AI for ${school.name}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
