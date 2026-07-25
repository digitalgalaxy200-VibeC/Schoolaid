export interface ReportCardData {
  school: {
    name: string;
    logo_url: string | null;
    address: string | null;
    phone?: string | null;
    email?: string | null;
    motto?: string | null;
  };
  student: {
    name: string;
    admission_no: string;
    photo_url: string | null;
  };
  classInfo: {
    className: string;
    position: number | null;
    totalStudents: number;
  };
  termInfo: {
    session: string;
    term: string;
  };
  academic: {
    subjects: Array<{
      id: string;
      name: string;
      total_score: number | null;
      grade: string;
      remark: string | null;
    }>;
    grandTotal: number;
    average: number;
    overallGrade: string;
    maxPossibleTotal: number;
  };
  attendance: {
    daysOpened: number | null;
    daysPresent: number | null;
    daysAbsent: number | null;
  };
  traits: {
    psychomotor: Array<{ name: string; score: string | number }>;
    affective: Array<{ name: string; score: string | number }>;
  };
  remarks: {
    teacher: string | null;
    admin: string | null;
  };
  gradingScales: Array<{
    grade: string;
    minimum_score: number;
    maximum_score: number;
    remark: string | null;
  }>;
  isDraft?: boolean;
}
