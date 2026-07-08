"use client";

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Register fonts (system fallbacks work in most environments)
// ---------------------------------------------------------------------------
Font.register({
  family: "Inter",
  fonts: [
    { src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZs.woff2", fontWeight: 400 },
    { src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZs.woff2", fontWeight: 700 },
  ],
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Inter",
    fontSize: 11,
    color: "#16202e",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    borderBottom: "2px solid #2a4b8d",
    paddingBottom: 16,
  },
  logo: {
    width: 56,
    height: 56,
    marginRight: 16,
    objectFit: "contain",
  },
  headerText: {
    flex: 1,
  },
  schoolName: {
    fontSize: 18,
    fontWeight: 700,
    color: "#2a4b8d",
    marginBottom: 2,
  },
  schoolMotto: {
    fontSize: 10,
    color: "#8891a0",
    fontStyle: "italic",
  },
  schoolAddress: {
    fontSize: 9,
    color: "#4b5666",
    marginTop: 4,
  },
  reportTitle: {
    textAlign: "center",
    marginBottom: 20,
  },
  reportTitleText: {
    fontSize: 16,
    fontWeight: 700,
    color: "#2a4b8d",
    textTransform: "uppercase",
  },
  reportSubtitle: {
    fontSize: 11,
    color: "#4b5666",
    marginTop: 4,
  },
  studentInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    padding: 12,
    backgroundColor: "#e8eefa",
    borderRadius: 4,
  },
  studentInfoItem: {
    fontSize: 10,
    color: "#16202e",
  },
  label: {
    fontWeight: 700,
    color: "#2a4b8d",
  },
  table: {
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#2a4b8d",
    padding: 8,
  },
  tableHeaderCell: {
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    flex: 1,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "1px solid #e2e5ea",
    padding: 7,
  },
  tableRowAlt: {
    flexDirection: "row",
    borderBottom: "1px solid #e2e5ea",
    padding: 7,
    backgroundColor: "#f5f6f8",
  },
  tableCell: {
    fontSize: 10,
    flex: 1,
    color: "#16202e",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#2a4b8d",
    marginBottom: 8,
    marginTop: 16,
    borderBottom: "1px solid #e2e5ea",
    paddingBottom: 4,
  },
  traitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottom: "1px dotted #e2e5ea",
  },
  traitName: {
    fontSize: 10,
    color: "#4b5666",
  },
  traitScore: {
    fontSize: 10,
    fontWeight: 700,
    color: "#16202e",
  },
  commentBox: {
    padding: 10,
    backgroundColor: "#f5f6f8",
    borderRadius: 4,
    marginBottom: 8,
  },
  commentLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: "#2a4b8d",
    marginBottom: 4,
  },
  commentText: {
    fontSize: 10,
    color: "#4b5666",
    lineHeight: 1.5,
  },
  gradingKey: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "#f5f6f8",
    borderRadius: 4,
  },
  gradingKeyTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: "#2a4b8d",
    marginBottom: 6,
  },
  gradingKeyRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  gradingKeyGrade: {
    fontSize: 9,
    fontWeight: 700,
    width: 40,
  },
  gradingKeyRange: {
    fontSize: 9,
    width: 80,
    color: "#4b5666",
  },
  gradingKeyRemark: {
    fontSize: 9,
    color: "#4b5666",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: "#8891a0",
    borderTop: "1px solid #e2e5ea",
    paddingTop: 8,
  },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ReportCardData {
  studentName: string;
  admissionNumber: string;
  schoolName: string;
  schoolLogo: string | null;
  schoolAddress: string;
  schoolPhone: string;
  schoolEmail: string;
  schoolMotto: string;
  session: string;
  term: string;
  results: Array<{
    subject: string;
    totalScore: number;
    grade: string;
    remark: string;
  }>;
  attendance: {
    days_school_opened: number;
    days_present: number;
    days_absent: number;
  } | null;
  psychomotor: Array<{ name: string; score: number }>;
  affective: Array<{ name: string; score: number }>;
  teacherComment: string;
  adminComment: string;
  gradingScales: Array<{
    grade: string;
    minimum_score: number;
    maximum_score: number;
    remark: string;
  }>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ReportCardPDF({ data }: { data: ReportCardData }) {
  const {
    studentName,
    admissionNumber,
    schoolName,
    schoolLogo,
    schoolAddress,
    schoolPhone,
    schoolEmail,
    schoolMotto,
    session,
    term,
    results,
    attendance,
    psychomotor,
    affective,
    teacherComment,
    adminComment,
    gradingScales,
  } = data;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {schoolLogo && <Image src={schoolLogo} style={styles.logo} />}
          <View style={styles.headerText}>
            <Text style={styles.schoolName}>{schoolName}</Text>
            {schoolMotto && <Text style={styles.schoolMotto}>{schoolMotto}</Text>}
            {schoolAddress && <Text style={styles.schoolAddress}>{schoolAddress}</Text>}
            {schoolPhone && <Text style={styles.schoolAddress}>Tel: {schoolPhone}</Text>}
            {schoolEmail && <Text style={styles.schoolAddress}>Email: {schoolEmail}</Text>}
          </View>
        </View>

        {/* Report Title */}
        <View style={styles.reportTitle}>
          <Text style={styles.reportTitleText}>Student Report Card</Text>
          <Text style={styles.reportSubtitle}>
            {session} · {term}
          </Text>
        </View>

        {/* Student Info */}
        <View style={styles.studentInfo}>
          <Text style={styles.studentInfoItem}>
            <Text style={styles.label}>Name: </Text>
            {studentName}
          </Text>
          <Text style={styles.studentInfoItem}>
            <Text style={styles.label}>Admission No: </Text>
            {admissionNumber}
          </Text>
        </View>

        {/* Attendance */}
        {attendance && (
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: "row", gap: 24 }}>
              <Text style={{ fontSize: 10 }}>
                <Text style={{ fontWeight: 700 }}>Days School Opened: </Text>
                {attendance.days_school_opened}
              </Text>
              <Text style={{ fontSize: 10 }}>
                <Text style={{ fontWeight: 700 }}>Days Present: </Text>
                {attendance.days_present}
              </Text>
              <Text style={{ fontSize: 10 }}>
                <Text style={{ fontWeight: 700 }}>Days Absent: </Text>
                {attendance.days_absent}
              </Text>
            </View>
          </View>
        )}

        {/* Results Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Subject</Text>
            <Text style={styles.tableHeaderCell}>Total Score</Text>
            <Text style={styles.tableHeaderCell}>Grade</Text>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Remark</Text>
          </View>
          {results.map((row, i) => (
            <View
              key={i}
              style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}
            >
              <Text style={[styles.tableCell, { flex: 2 }]}>{row.subject}</Text>
              <Text style={styles.tableCell}>{row.totalScore}</Text>
              <Text style={[styles.tableCell, { fontWeight: 700 }]}>{row.grade}</Text>
              <Text style={[styles.tableCell, { flex: 2 }]}>{row.remark}</Text>
            </View>
          ))}
        </View>

        {/* Psychomotor */}
        {psychomotor.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Psychomotor Skills</Text>
            {psychomotor.map((item, i) => (
              <View key={i} style={styles.traitRow}>
                <Text style={styles.traitName}>{item.name}</Text>
                <Text style={styles.traitScore}>{item.score}/5</Text>
              </View>
            ))}
          </>
        )}

        {/* Affective */}
        {affective.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Affective Traits</Text>
            {affective.map((item, i) => (
              <View key={i} style={styles.traitRow}>
                <Text style={styles.traitName}>{item.name}</Text>
                <Text style={styles.traitScore}>{item.score}/5</Text>
              </View>
            ))}
          </>
        )}

        {/* Teacher's Comment */}
        {teacherComment && (
          <>
            <Text style={styles.sectionTitle}>Teacher's Comment</Text>
            <View style={styles.commentBox}>
              <Text style={styles.commentText}>{teacherComment}</Text>
            </View>
          </>
        )}

        {/* Principal's / Admin Comment */}
        {adminComment && (
          <>
            <Text style={styles.sectionTitle}>Principal's Comment</Text>
            <View style={styles.commentBox}>
              <Text style={styles.commentText}>{adminComment}</Text>
            </View>
          </>
        )}

        {/* Grading Key */}
        {gradingScales.length > 0 && (
          <View style={styles.gradingKey}>
            <Text style={styles.gradingKeyTitle}>Grading System</Text>
            {gradingScales.map((g, i) => (
              <View key={i} style={styles.gradingKeyRow}>
                <Text style={styles.gradingKeyGrade}>{g.grade}</Text>
                <Text style={styles.gradingKeyRange}>
                  {g.minimum_score} – {g.maximum_score}
                </Text>
                <Text style={styles.gradingKeyRemark}>{g.remark}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer}>
          Generated by SchoolAid · This is a computer-generated document
        </Text>
      </Page>
    </Document>
  );
}
