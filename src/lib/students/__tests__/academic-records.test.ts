import { describe, it, expect } from "vitest";
import { loadStudentAcademicRecords } from "../academic-records";

/**
 * A tiny thenable query builder covering the chain shapes the loader uses.
 * It lets these tests prove the read path without a database: which table is
 * read, which filters are applied, and how the result is assembled.
 */
class FakeQuery {
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private mode: "many" | "one" | "maybe" = "many";

  constructor(
    private readonly tables: Record<string, Record<string, unknown>[]>,
    private readonly table: string,
  ) {}

  select(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  order(): this {
    return this;
  }

  maybeSingle(): this {
    this.mode = "maybe";
    return this;
  }

  single(): this {
    this.mode = "one";
    return this;
  }

  private result() {
    const rows = (this.tables[this.table] || []).filter((row) =>
      this.filters.every((matches) => matches(row)),
    );
    if (this.mode === "maybe") return { data: rows[0] ?? null, error: null };
    if (this.mode === "one") {
      return rows[0]
        ? { data: rows[0], error: null }
        : { data: null, error: { message: "not found" } };
    }
    return { data: rows, error: null };
  }

  then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve(this.result()).then(resolve, reject);
  }
}

function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from: (table: string) => new FakeQuery(tables, table),
  } as unknown as Parameters<typeof loadStudentAcademicRecords>[0];
}

describe("loadStudentAcademicRecords", () => {
  it("resolves subject names from the catalogue when the snapshot never stored one", async () => {
    const db = fakeDb({
      term_results: [
        {
          school_id: "school-1",
          student_id: "student-1",
          term_id: "term-1",
          subject_id: "subject-1",
          subject_name: null,
          subject_code: null,
          total_score: 70,
          grade: "B",
          remark: "Good",
          published: true,
        },
      ],
      academic_terms: [
        {
          id: "term-1",
          school_id: "school-1",
          name: "Second Term",
          session_id: "session-1",
          start_date: "2026-01-10",
        },
      ],
      academic_sessions: [
        { id: "session-1", school_id: "school-1", name: "2025/2026", start_date: "2025-09-01" },
      ],
      subjects: [{ id: "subject-1", school_id: "school-1", name: "Mathematics", code: "MTH" }],
    });

    const terms = await loadStudentAcademicRecords(db, {
      school_id: "school-1",
      student_id: "student-1",
    });

    expect(terms).toHaveLength(1);
    expect(terms[0]).toMatchObject({
      term_name: "Second Term",
      session_name: "2025/2026",
      published: true,
    });
    expect(terms[0].subjects).toEqual([
      {
        subject_id: "subject-1",
        subject_name: "Mathematics",
        subject_code: "MTH",
        total_score: 70,
        grade: "B",
        remark: "Good",
      },
    ]);
  });

  it("groups subjects by term and orders the newest session first", async () => {
    const db = fakeDb({
      term_results: [
        {
          school_id: "school-1",
          student_id: "student-1",
          term_id: "term-old",
          subject_id: "subject-1",
          subject_name: "Mathematics",
          subject_code: "MTH",
          total_score: 60,
          grade: "C",
          remark: null,
          published: true,
        },
        {
          school_id: "school-1",
          student_id: "student-1",
          term_id: "term-new",
          subject_id: "subject-2",
          subject_name: "English",
          subject_code: "ENG",
          total_score: 80,
          grade: "A",
          remark: "Excellent",
          published: false,
        },
        {
          school_id: "school-1",
          student_id: "student-1",
          term_id: "term-new",
          subject_id: "subject-1",
          subject_name: "Mathematics",
          subject_code: "MTH",
          total_score: 75,
          grade: "A",
          remark: "Good",
          published: false,
        },
      ],
      academic_terms: [
        {
          id: "term-old",
          school_id: "school-1",
          name: "Third Term",
          session_id: "session-old",
          start_date: "2025-06-01",
        },
        {
          id: "term-new",
          school_id: "school-1",
          name: "First Term",
          session_id: "session-new",
          start_date: "2025-09-10",
        },
      ],
      academic_sessions: [
        { id: "session-old", school_id: "school-1", name: "2024/2025", start_date: "2024-09-01" },
        { id: "session-new", school_id: "school-1", name: "2025/2026", start_date: "2025-09-01" },
      ],
      subjects: [],
    });

    const terms = await loadStudentAcademicRecords(db, {
      school_id: "school-1",
      student_id: "student-1",
    });

    expect(terms.map((term) => term.term_name)).toEqual(["First Term", "Third Term"]);
    expect(terms[0].subjects.map((subject) => subject.subject_name)).toEqual([
      "English",
      "Mathematics",
    ]);
    expect(terms[0].published).toBe(false);
  });

  it("ignores live scores — only approved final results are academic records", async () => {
    const db = fakeDb({
      term_results: [],
      academic_terms: [
        {
          id: "term-active",
          school_id: "school-1",
          name: "First Term",
          session_id: "session-1",
          start_date: "2025-09-10",
          is_active: true,
        },
      ],
      student_scores: [
        {
          school_id: "school-1",
          student_id: "student-1",
          term_id: "term-active",
          subject_id: "subject-1",
          component_id: "c1",
          score: 80,
        },
      ],
    });

    const terms = await loadStudentAcademicRecords(db, {
      school_id: "school-1",
      student_id: "student-1",
    });

    expect(terms).toEqual([]);
  });

  it("returns nothing when no final results exist", async () => {
    const db = fakeDb({ term_results: [] });
    const terms = await loadStudentAcademicRecords(db, {
      school_id: "school-1",
      student_id: "student-1",
    });
    expect(terms).toEqual([]);
  });
});
