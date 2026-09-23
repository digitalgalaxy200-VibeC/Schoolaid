import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A minimal stand-in for the Supabase client, for tests that must not touch a
 * database.
 *
 * WHY THIS EXISTS
 * ---------------
 * The AI gateway's job is a sequence of database decisions: is a provider
 * enabled, can the school afford this, was the call recorded. Stubbing the whole
 * chain lets a test assert the SEQUENCE and the SIDE EFFECTS — that a refusal
 * never reached a provider, that a success wrote exactly one usage row, that the
 * charge amount was the pricing function's output — which a test against a live
 * database could not assert nearly as precisely.
 *
 * It is deliberately faithful about two things that are easy to get wrong and
 * that the real client does: the query builder is CHAINABLE AND AWAITABLE at the
 * same time (`.select().eq(...).eq(...)` then `await`), and `maybeSingle()`
 * returns the single row rather than a one-element array.
 *
 * The cast to `SupabaseClient` is unavoidable: no hand-written fake satisfies
 * that interface's full surface, and pretending otherwise would mean generating
 * hundreds of unused methods.
 */

export type QuerySpec = {
  table: string;
  /** Filters in the order they were applied, so a test can assert them. */
  filters: [string, unknown][];
  columns: string | null;
  single: boolean;
};

export type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

export type RecordedInsert = { table: string; row: Record<string, unknown> };
export type RecordedRpc = { name: string; args: Record<string, unknown> };

export type FakeOptions = {
  /** Answers a select. Return rows (an array) — `maybeSingle` unwraps it. */
  select?: (spec: QuerySpec) => QueryResult;
  /** Answers an insert. */
  insert?: (table: string, row: Record<string, unknown>) => QueryResult;
  /** Answers an rpc. */
  rpc?: (name: string, args: Record<string, unknown>) => QueryResult;
};

export type FakeSupabase = {
  client: SupabaseClient;
  selects: QuerySpec[];
  inserts: RecordedInsert[];
  rpcs: RecordedRpc[];
};

const ok = (data: unknown): QueryResult => ({ data, error: null });
const failed = (message: string, code?: string): QueryResult => ({
  data: null,
  error: { message, code },
});

export function fakeSupabase(options: FakeOptions = {}): FakeSupabase {
  const selects: QuerySpec[] = [];
  const inserts: RecordedInsert[] = [];
  const rpcs: RecordedRpc[] = [];

  class FakeTable implements PromiseLike<QueryResult> {
    private spec: QuerySpec;
    private insertedRow: Record<string, unknown> | null = null;

    constructor(table: string) {
      this.spec = { table, filters: [], columns: null, single: false };
    }

    select(columns?: string): this {
      this.spec.columns = columns ?? "*";
      return this;
    }

    insert(row: Record<string, unknown>): this {
      this.insertedRow = row;
      return this;
    }

    eq(column: string, value: unknown): this {
      this.spec.filters.push([column, value]);
      return this;
    }

    maybeSingle(): this {
      this.spec.single = true;
      return this;
    }

    then<TResult1 = QueryResult, TResult2 = never>(
      onFulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      let result: QueryResult;

      if (this.insertedRow) {
        inserts.push({ table: this.spec.table, row: this.insertedRow });
        result = options.insert
          ? options.insert(this.spec.table, this.insertedRow)
          : ok(null);
      } else {
        selects.push(this.spec);
        const raw = options.select ? options.select(this.spec) : ok([]);
        if (raw.error) {
          result = raw;
        } else if (this.spec.single) {
          const rows = Array.isArray(raw.data) ? raw.data : raw.data ? [raw.data] : [];
          result = ok(rows.length > 0 ? rows[0] : null);
        } else {
          result = raw;
        }
      }

      return Promise.resolve(result).then(onFulfilled, onRejected);
    }
  }

  const client = {
    from(table: string) {
      return new FakeTable(table);
    },
    rpc(name: string, args: Record<string, unknown> = {}) {
      rpcs.push({ name, args });
      const result = options.rpc ? options.rpc(name, args) : ok(null);
      return Promise.resolve(result);
    },
  } as unknown as SupabaseClient;

  return { client, selects, inserts, rpcs };
}

export { ok as fakeOk, failed as fakeError };
