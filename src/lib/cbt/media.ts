import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValidatedUpload } from "@/lib/ai/uploads";

/**
 * Question media (V1: one optional image per question).
 *
 * WHERE IT LIVES
 * --------------
 * The bytes are in the PRIVATE `assessment-media` bucket (the same bucket the
 * legacy score-sheet import uses). The database reference is a row in
 * `cbt_question_media` (migration 045 — designed for this, wired up now).
 * Nothing here is ever public: students and staff receive short-lived signed
 * URLs, generated per read.
 *
 * IMMUTABILITY RULE — READ BEFORE "CLEANING UP"
 * ---------------------------------------------
 * Attempts freeze the media PATH into their snapshot. That means an object
 * referenced by an attempt must survive any later edit: replacing a question's
 * image uploads a NEW object and updates the reference, but the OLD object is
 * deliberately left in the bucket. Deleting it would blank the image on a past
 * student's frozen paper. Orphaned objects are private and inert; correctness
 * wins over tidiness.
 *
 * All storage operations require the service client (the bucket has no tenant
 * policies by design) and must only run after the caller has authorized the
 * actor with `authorizeQuestionContext` / `authorizeCbtAssessment`.
 */

export const QUESTION_MEDIA_BUCKET = "assessment-media";

export type QuestionMediaRecord = {
  id: string;
  storage_path: string;
  content_type: string | null;
  caption: string | null;
};

/** The media reference as frozen into an attempt snapshot. */
export type FrozenQuestionMedia = {
  storage_path: string;
  content_type: string | null;
};

/** Storage path for a question's image. Extension comes from the VERIFIED type. */
export function questionMediaPath(schoolId: string, questionId: string, extension: string): string {
  return `${schoolId}/cbt/${questionId}/${crypto.randomUUID()}.${extension}`;
}

/**
 * Signed-URL lifetime for a student attempt.
 *
 * `time_limit + 1 hour`, floored at 1 hour (untimed papers still need a usable
 * window) and capped at 12 hours — a signed URL is a capability, and an
 * unbounded one outlives the attempt it was minted for.
 */
export function attemptMediaTtlSeconds(expiresAt: string | null, now: Date = new Date()): number {
  const ONE_HOUR = 3600;
  const TWELVE_HOURS = 12 * 3600;

  if (!expiresAt) return 2 * ONE_HOUR;

  const remainingMs = Date.parse(expiresAt) - now.getTime();
  const seconds = Math.floor(Math.max(0, remainingMs) / 1000) + ONE_HOUR;
  return Math.min(Math.max(seconds, ONE_HOUR), TWELVE_HOURS);
}

/** Reads the media row for one question (V1: at most one row). */
export async function getQuestionMedia(
  supabase: SupabaseClient,
  schoolId: string,
  questionId: string,
): Promise<QuestionMediaRecord | null> {
  const { data } = await supabase
    .from("cbt_question_media")
    .select("id, storage_path, content_type, caption")
    .eq("school_id", schoolId)
    .eq("question_id", questionId)
    .order("id")
    .limit(1)
    .maybeSingle();
  return (data as QuestionMediaRecord | null) ?? null;
}

/** Batch read for lists and attempt start: question id -> media reference. */
export async function readQuestionMediaMap(
  supabase: SupabaseClient,
  schoolId: string,
  questionIds: string[],
): Promise<Map<string, FrozenQuestionMedia>> {
  const map = new Map<string, FrozenQuestionMedia>();
  if (questionIds.length === 0) return map;

  const { data } = await supabase
    .from("cbt_question_media")
    .select("question_id, storage_path, content_type")
    .eq("school_id", schoolId)
    .in("question_id", questionIds);

  for (const row of data ?? []) {
    const questionId = row.question_id as string;
    if (map.has(questionId)) continue; // one image per question in V1
    map.set(questionId, {
      storage_path: row.storage_path as string,
      content_type: (row.content_type as string | null) ?? null,
    });
  }
  return map;
}

/**
 * Attaches (or replaces) a question's image.
 *
 * Replace = upload a new object, drop the old ROW, insert the new one. The old
 * OBJECT stays (see the immutability rule above).
 */
export async function attachQuestionImage(
  supabase: SupabaseClient,
  args: { schoolId: string; questionId: string; upload: ValidatedUpload },
): Promise<{ ok: true; storagePath: string } | { error: string }> {
  const path = questionMediaPath(args.schoolId, args.questionId, args.upload.extension);

  const { error: uploadError } = await supabase.storage
    .from(QUESTION_MEDIA_BUCKET)
    .upload(path, args.upload.bytes, { contentType: args.upload.mimeType, upsert: false });
  if (uploadError) return { error: `could not store the image: ${uploadError.message}` };

  const { error: deleteError } = await supabase
    .from("cbt_question_media")
    .delete()
    .eq("school_id", args.schoolId)
    .eq("question_id", args.questionId);
  if (deleteError) return { error: deleteError.message };

  const { error: insertError } = await supabase.from("cbt_question_media").insert({
    school_id: args.schoolId,
    question_id: args.questionId,
    storage_path: path,
    content_type: args.upload.mimeType,
  });
  if (insertError) return { error: insertError.message };

  return { ok: true, storagePath: path };
}

/** Detaches a question's image. The stored object is retained — see above. */
export async function removeQuestionMedia(
  supabase: SupabaseClient,
  args: { schoolId: string; questionId: string },
): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase
    .from("cbt_question_media")
    .delete()
    .eq("school_id", args.schoolId)
    .eq("question_id", args.questionId);
  return error ? { error: error.message } : { ok: true };
}

/** A short-lived signed URL for a stored object, or null when signing fails. */
export async function signQuestionMedia(
  supabase: SupabaseClient,
  storagePath: string,
  ttlSeconds: number,
): Promise<string | null> {
  const { data } = await supabase.storage
    .from(QUESTION_MEDIA_BUCKET)
    .createSignedUrl(storagePath, ttlSeconds);
  return data?.signedUrl ?? null;
}
