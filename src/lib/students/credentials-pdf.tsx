// ============================================================================
// Students — class login sheet (PDF)
//
// WHAT THIS IS FOR
// ----------------
// A class teacher hands each child their login. Typing thirty usernames onto a
// board is where mistakes happen, so the sheet prints the class roster with each
// student's username and their current temporary password.
//
// THE PASSWORD COLUMN IS HONEST ABOUT ITSELF
// ------------------------------------------
// SchoolAid stores a plain-text password ONLY while it is an un-used temporary
// one: the reset flows write `generated_password`, and the first successful
// sign-in clears it (see api/auth/login). So a blank cell is not a bug — it
// means either the child has already signed in, or no password has been issued.
// Those rows print "Reset needed" rather than an empty box, because an empty box
// reads like "no password exists" and a guess there wastes a lesson.
//
// DESIGN: every measure comes from `document-theme.ts`, the same tokens the
// receipts and invoices use, so paper generated anywhere in the product looks
// like it came from the same school.
// ============================================================================

import { Document, Page, Text, View, Font, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { DOC } from "@/lib/finance/document-theme";
import { NotoSansRegularBase64, NotoSansBoldBase64 } from "@/lib/finance/embedded-fonts";

// Names can carry diacritics, and the built-in PDF fonts do not. Same embedded
// font as the finance documents, so nothing renders as a broken glyph.
Font.register({
  family: "SchoolAidSans",
  fonts: [
    { src: NotoSansRegularBase64, fontWeight: "normal" },
    { src: NotoSansBoldBase64, fontWeight: "bold" },
  ],
});

const { color, size, space, radius } = DOC;

/** Rows that comfortably fit on one A4 page below the header and the note. */
const ROWS_PER_PAGE = 26;

export type ClassCredentialRow = {
  name: string;
  username: string;
  /** The stored temporary password, or null when none is known. */
  password: string | null;
};

export type ClassCredentialsPdfData = {
  school_name: string;
  class_name: string;
  /** e.g. "First Term · 2026/2027 Session". Null when no term is active. */
  term_label: string | null;
  /** Already formatted for paper ("23 Nov 2026"). */
  generated_on: string;
  rows: ClassCredentialRow[];
};

const styles = StyleSheet.create({
  page: {
    paddingTop: space.xl + space.sm,
    paddingBottom: space.xl,
    paddingHorizontal: space.xl + space.sm,
    fontSize: size.body,
    fontFamily: "SchoolAidSans",
    color: color.text,
  },
  schoolName: { fontSize: size.school, fontWeight: "bold" },
  title: {
    fontSize: size.title,
    fontWeight: "bold",
    letterSpacing: 1.2,
    marginTop: space.sm,
    color: color.brand,
    textTransform: "uppercase",
  },
  meta: { fontSize: size.caption, color: color.muted, marginTop: space.xs - 2 },

  table: {
    marginTop: space.lg,
    borderWidth: 1,
    borderColor: color.container,
    borderRadius: radius,
  },
  head: {
    flexDirection: "row",
    backgroundColor: color.rowShade,
    borderBottomWidth: 1,
    borderBottomColor: color.container,
  },
  row: { flexDirection: "row", borderTopWidth: 1, borderTopColor: color.separator },
  rowFirst: { borderTopWidth: 0 },
  cell: { paddingVertical: space.xs + 1, paddingHorizontal: space.sm },
  cellDivider: { borderRightWidth: 1, borderRightColor: color.separator },
  th: {
    fontSize: size.caption,
    color: color.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontWeight: "bold",
  },
  sn: { width: 26, textAlign: "center" },
  name: { flex: 3 },
  username: { flex: 3 },
  password: { flex: 2 },
  muted: { color: color.faint },

  note: {
    marginTop: space.md,
    borderWidth: 1,
    borderColor: color.container,
    borderRadius: radius,
    backgroundColor: color.tint,
    padding: space.sm + 2,
  },
  noteTitle: { fontSize: size.caption, fontWeight: "bold", color: color.brandDark },
  noteBody: { fontSize: size.caption, color: color.muted, marginTop: space.xs - 2, lineHeight: 1.35 },

  footer: {
    position: "absolute",
    bottom: space.md,
    left: space.xl + space.sm,
    right: space.xl + space.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: size.fine,
    color: color.faint,
  },
});

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function CredentialTable({ rows, startAt }: { rows: ClassCredentialRow[]; startAt: number }) {
  return (
    <View style={styles.table}>
      <View style={styles.head}>
        <Text style={[styles.cell, styles.cellDivider, styles.th, styles.sn]}>S/N</Text>
        <Text style={[styles.cell, styles.cellDivider, styles.th, styles.name]}>Student</Text>
        <Text style={[styles.cell, styles.cellDivider, styles.th, styles.username]}>Username</Text>
        <Text style={[styles.cell, styles.th, styles.password]}>Password</Text>
      </View>
      {rows.map((row, i) => (
        <View
          key={`${row.username}-${i}`}
          style={[styles.row, i === 0 ? styles.rowFirst : {}]}
          wrap={false}
        >
          <Text style={[styles.cell, styles.cellDivider, styles.sn]}>{startAt + i}</Text>
          <Text style={[styles.cell, styles.cellDivider, styles.name]}>{row.name}</Text>
          <Text style={[styles.cell, styles.cellDivider, styles.username]}>{row.username}</Text>
          <Text
            style={[
              styles.cell,
              styles.password,
              row.password ? {} : styles.muted,
            ]}
          >
            {row.password ?? "Reset needed"}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ClassCredentialsDocument({ data }: { data: ClassCredentialsPdfData }) {
  const pages = chunk(data.rows, ROWS_PER_PAGE);
  const total = pages.length;

  return (
    <Document
      title={`${data.class_name} — student logins`}
      author={data.school_name}
      subject="Student login credentials"
    >
      {pages.map((rows, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          <Text style={styles.schoolName}>{data.school_name}</Text>
          <Text style={styles.title}>Student login credentials</Text>
          <Text style={styles.meta}>
            {[data.class_name, data.term_label, `${data.rows.length} student${data.rows.length === 1 ? "" : "s"}`]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          <Text style={styles.meta}>Printed {data.generated_on}</Text>

          <CredentialTable rows={rows} startAt={pageIndex * ROWS_PER_PAGE + 1} />

          <View style={styles.note}>
            <Text style={styles.noteTitle}>How to read the password column</Text>
            <Text style={styles.noteBody}>
              A password is shown only while it is still a temporary one. It clears the moment the
              student signs in for the first time, because they are then required to choose their
              own. Where this sheet says &quot;Reset needed&quot;, reset that student from My Students
              → the student&apos;s menu → Reset Password: that restores the standard student
              password, which the child is again asked to change at their next sign-in.
              Treat this page as confidential: it can sign a child in.
            </Text>
          </View>

          <View style={styles.footer} fixed>
            <Text>{data.school_name} · {data.class_name}</Text>
            <Text>
              Page {pageIndex + 1} of {total}
            </Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}

export async function renderClassCredentialsPdf(data: ClassCredentialsPdfData): Promise<Buffer> {
  return renderToBuffer(<ClassCredentialsDocument data={data} />);
}
