export interface StudentInfo {
  grade: '1' | '2' | '3' | '';
  desiredField: string;
  academicRecord?: string; // Now optional
  academicRecordImage?: {
    mimeType: string;
    data: string; // base64
  };
  manualAcademicRecord?: ManualAcademicRecord;
  mockExam: {
    korean: string;
    math: string;
    english: string;
    inquiry1: string;
    inquiry2: string;
  };
}

export interface ManualAcademicRecord {
  awards: string;
  creativeActivities: string;
  detailedAbilities: string;
  readingActivities: string;
  behavioralCharacteristics: string;
}

export interface QuantitativeAnalysis {
  gpaZScore: {
    subject: string;
    zScore: number;
  }[];
  gradeTrend: {
    semester: string;
    gpa: number;
  }[];
  mockExamAnalysis: {
    subject: string;
    strength: boolean;
    comment: string;
  }[];
}

export interface QualitativeAnalysis {
  keywordCloud: {
    text: string;
    value: number;
  }[];
  competencyRadar: {
    subject: string;
    score: number;
    fullMark: number;
  }[];
}

export interface ApplicationStrategy {
  earlyDecisionProbability: number;
  regularDecisionProbability: number;
}

export type RecommendationCategory = '상향' | '적정' | '안정';

export interface UniversityRecommendation {
  category: RecommendationCategory;
  university: string;
  major: string;
  admissionType: string;
  acceptanceChance: number;
  rationale: string;
}

export interface LocalSupport {
  weakSubject: string;
  recommendedAcademies: {
    name: string;
    distance: string;
    rating: number;
    reviewCount: number;
  }[];
  recommendedStudySpaces: {
    name: string;
    type: 'Library' | 'Study Cafe';
    distance: string;
    rating: number;
  }[];
}

export interface AnalysisReport {
  studentName: string;
  recommendedApplicationType: string;
  quantitativeAnalysis: QuantitativeAnalysis;
  qualitativeAnalysis: QualitativeAnalysis;
  applicationStrategy: ApplicationStrategy;
  earlyDecisionRecommendations: UniversityRecommendation[];
  regularDecisionRecommendations: UniversityRecommendation[];
  localSupport: LocalSupport;
}