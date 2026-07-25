"use client";

const DRAFT_PREFIX = "schoolaid_draft_";

export interface ReportCardDraft {
  attendance: Record<string, { days_school_opened: string; days_present: string }>;
  traitValues: Record<string, Record<string, string>>;
  remarks: Record<string, string>;
  savedAt: string;
}

export function saveDraft(classId: string, data: Omit<ReportCardDraft, "savedAt">) {
  if (typeof window === "undefined") return;
  try {
    const draft: ReportCardDraft = { ...data, savedAt: new Date().toISOString() };
    localStorage.setItem(DRAFT_PREFIX + classId, JSON.stringify(draft));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function loadDraft(classId: string): ReportCardDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + classId);
    if (!raw) return null;
    return JSON.parse(raw) as ReportCardDraft;
  } catch {
    return null;
  }
}

export function clearDraft(classId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DRAFT_PREFIX + classId);
  } catch {
    // ignore
  }
}
