/**
 * One-way hashing for password bookkeeping.
 *
 * SchoolEd keeps a registry of already-issued passwords so `generateUniquePassword`
 * can avoid handing out the same value twice. That registry used to store the
 * passwords themselves in plain text, which meant a single database dump yielded
 * every user's current credential.
 *
 * The registry only ever needs to answer "have we issued this before?", so a
 * one-way digest is sufficient. This module provides that digest.
 *
 * A fixed context prefix is mixed in so these digests cannot be matched against
 * a generic precomputed table of common password hashes.
 *
 * Uses Web Crypto, so it works in both the Node and Edge runtimes.
 */

const CONTEXT = "schooled-password-registry:v1:";

export async function hashPasswordForRegistry(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(CONTEXT + password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
