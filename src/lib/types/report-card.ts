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
    gender?: string | null;
    dob?: string | null;
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
    assessmentComponents: Array<{ id: string; name: string; max_score: number; order: number }>;
    subjects: Array<{
      id: string;
      name: string;
      total_score: number | null;
      grade: string;
      remark: string | null;
      component_scores: Record<string, number | null>;
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
  settings?: {
    show_position: boolean;
    show_average: boolean;
    show_attendance: boolean;
    show_psychomotor: boolean;
    show_affective: boolean;
    show_teacher_remark: boolean;
    show_admin_remark: boolean;
    show_grading_key: boolean;
    show_photo: boolean;
    show_gender: boolean;
    show_dob: boolean;
    show_component_scores: boolean;
  };
}
