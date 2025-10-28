
import { GoogleGenAI, Type } from "@google/genai";
import type { StudentInfo, AnalysisReport, ManualAcademicRecord } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

export const extractDataFromImage = async (
  academicRecordImage: { mimeType: string; data: string }
): Promise<{ studentName: string; manualRecord: ManualAcademicRecord }> => {
  const prompt = `
    You are an expert OCR system specialized in South Korean academic records (학생생활기록부, Saenggibu).
    Analyze the provided image of an academic record and extract the student's name and the text content for the following key sections:
    1.  **성명 (Student Name)**
    2.  **수상경력 (Awards)**
    3.  **창의적 체험활동상황 (Creative Experiential Activities)**: Include details from 자율활동, 동아리활동, 봉사활동, and 진로활동.
    4.  **세부능력 및 특기사항 (Detailed Abilities & Special Notes by Subject)**
    5.  **독서활동상황 (Reading Activities)**
    6.  **행동특성 및 종합의견 (Behavioral Characteristics & Comprehensive Opinion)**

    Summarize the content of each section. If a section is not found or is empty, return an empty string for that field. The student's name must be extracted accurately. If the name is not found, return "OOO".

    **CRITICAL**: The final output must be a single, valid JSON object that adheres to the provided schema. Do not add any text, markdown formatting, or explanations outside the JSON object.
  `;

  const imagePart = {
    inlineData: {
      mimeType: academicRecordImage.mimeType,
      data: academicRecordImage.data,
    },
  };

  const textPart = { text: prompt };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            studentName: { type: Type.STRING, description: "학생 성명" },
            awards: { type: Type.STRING, description: "수상경력" },
            creativeActivities: { type: Type.STRING, description: "창의적 체험활동상황" },
            detailedAbilities: { type: Type.STRING, description: "세부능력 및 특기사항" },
            readingActivities: { type: Type.STRING, description: "독서활동상황" },
            behavioralCharacteristics: { type: Type.STRING, description: "행동특성 및 종합의견" },
          },
          required: ["studentName", "awards", "creativeActivities", "detailedAbilities", "readingActivities", "behavioralCharacteristics"],
        },
      },
    });
    
    const jsonText = response.text.trim();
    const parsedJson = JSON.parse(jsonText);
    const { studentName, ...manualRecord } = parsedJson;
    return { studentName, manualRecord: manualRecord as ManualAcademicRecord };

  } catch (error) {
    console.error("Error calling Gemini API for data extraction:", error);
    throw new Error("Failed to extract data from the image. Please try again or enter the data manually.");
  }
};


const formatManualRecord = (record: ManualAcademicRecord): string => {
  return `
- **Academic Record (User-Verified Text)**: This is the primary source for qualitative analysis.
  - **Awards**: ${record.awards || 'N/A'}
  - **Creative Experiential Activities**: ${record.creativeActivities || 'N/A'}
  - **Detailed Abilities & Special Notes by Subject**: ${record.detailedAbilities || 'N/A'}
  - **Reading Activities**: ${record.readingActivities || 'N/A'}
  - **Behavioral Characteristics & Comprehensive Opinion**: ${record.behavioralCharacteristics || 'N/A'}
`;
};

const getAnalysisPrompt = (
  studentInfo: StudentInfo,
  location: { latitude: number; longitude: number } | null
): { parts: any[] } => {
  const locationInfo = location
    ? `The user is located at latitude ${location.latitude} and longitude ${location.longitude}.`
    : "The user has not provided their location.";

  let academicRecordInfo = '';
  const parts: any[] = [];

  const hasManualRecord = studentInfo.manualAcademicRecord && Object.values(studentInfo.manualAcademicRecord).some(v => typeof v === 'string' && v.trim() !== '');

  if (hasManualRecord) {
      // The user-verified text from the manual record is the sole source of truth now.
      // We no longer need to send the image again.
      academicRecordInfo = formatManualRecord(studentInfo.manualAcademicRecord!);
  } else if (studentInfo.academicRecordImage) {
    // This is a fallback case, but with the current UI flow, it's less likely.
    // If somehow manual record is empty but image exists, we still send the image.
    academicRecordInfo = "The academic record (생기부) is provided as an attached image. Please perform OCR and analyze its content.";
    parts.push({
      inlineData: {
        mimeType: studentInfo.academicRecordImage.mimeType,
        data: studentInfo.academicRecordImage.data,
      },
    });
  } else if (studentInfo.academicRecord) {
     academicRecordInfo = `- **Academic Record (Pasted Text)**:\n---\n${studentInfo.academicRecord}\n---`;
  } else {
    academicRecordInfo = "No academic record was provided. Please make a general analysis based on the mock exam scores and desired field.";
  }
  
  const mockExamScoresProvided = Object.values(studentInfo.mockExam).some(score => score.trim() !== '');
  const mockExamInfo = mockExamScoresProvided
    ? `- Mock Exam Scores (percentile): Korean ${studentInfo.mockExam.korean}, Math ${studentInfo.mockExam.math}, English ${studentInfo.mockExam.english}, Inquiry1 ${studentInfo.mockExam.inquiry1}, Inquiry2 ${studentInfo.mockExam.inquiry2}`
    : `- Mock Exam Scores: The user skipped this step. Please estimate the student's academic performance for the regular decision (정시) analysis based on the provided academic record (학생 생활기록부) content.`;
    
  const studentNameInfo = studentInfo.studentName 
    ? `The student's name is ${studentInfo.studentName}. Use this exact name in the report.`
    : `Anonymize the student's name to "OOO 학생".`;


  const promptText = `
    You are an expert South Korean college admissions consultant AI named '입시 네비게이터'. Your role is to provide a detailed, data-driven analysis for a parent about their high school student's university admission prospects.

    **Student Data:**
    - Grade: ${studentInfo.grade}학년
    - Desired Field of Study: ${studentInfo.desiredField}
    ${mockExamInfo}
    ${academicRecordInfo}

    **User Location:**
    ${locationInfo}

    **Your Task:**
    Analyze all the provided information and generate a comprehensive report. The report must be in Korean.

    1.  **Student Identification**: ${studentNameInfo}
    2.  **Quantitative Analysis**:
        - Create a grade trend chart data for 4 semesters. Estimate GPA based on the text.
        - Analyze mock exam scores, highlighting strengths and weaknesses. If scores are not provided, estimate performance based on the academic record.
        - Generate Z-scores for 5 key subjects based on the academic record.
    3.  **Qualitative Analysis**:
        - Extract at least 10-15 relevant keywords from the academic record for a keyword cloud, weighted by importance for the desired field.
        - Create a radar chart data for the 4 key competencies (학업역량, 전공적합성, 인성, 발전가능성) on a scale of 5.
    4.  **Application Strategy**:
        - Calculate the probability of success for Early Decision (수시) vs. Regular Decision (정시).
        - Recommend the most advantageous application type.
    5.  **University Recommendations**:
        - Recommend 6 Early Decision (수시) options categorized as '상향', '적정', '안정'.
        - Recommend 3 Regular Decision (정시) options categorized similarly.
        - For each recommendation, provide the university, major, admission type, chance of acceptance (%), and a brief rationale.
    6.  **Local Support (LBS)**:
        - Identify the student's weakest subject.
        - Based on the user's location, recommend 3 nearby specialized academies and 2 study spaces (libraries or study cafes). If location is not available, provide general advice. Include realistic names, distances, ratings, and review counts.

    **CRITICAL**: The final output must be a single, valid JSON object only. Do not add any text, markdown formatting like \`\`\`json, or any explanations outside the JSON object itself.
  `;
  
  parts.unshift({ text: promptText });

  return { parts };
};


export const analyzeStudentData = async (
  studentInfo: StudentInfo,
  location: { latitude: number; longitude: number } | null
): Promise<AnalysisReport> => {

  const contents = getAnalysisPrompt(studentInfo, location);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: contents.parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            studentName: { type: Type.STRING },
            recommendedApplicationType: { type: Type.STRING },
            quantitativeAnalysis: {
              type: Type.OBJECT,
              properties: {
                gpaZScore: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      subject: { type: Type.STRING },
                      zScore: { type: Type.NUMBER },
                    },
                    required: ["subject", "zScore"]
                  },
                },
                gradeTrend: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      semester: { type: Type.STRING },
                      gpa: { type: Type.NUMBER },
                    },
                    required: ["semester", "gpa"]
                  },
                },
                mockExamAnalysis: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      subject: { type: Type.STRING },
                      strength: { type: Type.BOOLEAN },
                      comment: { type: Type.STRING },
                    },
                    required: ["subject", "strength", "comment"]
                  },
                },
              },
              required: ["gpaZScore", "gradeTrend", "mockExamAnalysis"]
            },
            qualitativeAnalysis: {
              type: Type.OBJECT,
              properties: {
                keywordCloud: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      value: { type: Type.NUMBER },
                    },
                     required: ["text", "value"]
                  },
                },
                competencyRadar: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      subject: { type: Type.STRING },
                      score: { type: Type.NUMBER },
                      fullMark: { type: Type.NUMBER },
                    },
                    required: ["subject", "score", "fullMark"]
                  },
                },
              },
              required: ["keywordCloud", "competencyRadar"]
            },
            applicationStrategy: {
              type: Type.OBJECT,
              properties: {
                earlyDecisionProbability: { type: Type.NUMBER },
                regularDecisionProbability: { type: Type.NUMBER },
              },
              required: ["earlyDecisionProbability", "regularDecisionProbability"]
            },
            earlyDecisionRecommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  university: { type: Type.STRING },
                  major: { type: Type.STRING },
                  admissionType: { type: Type.STRING },
                  acceptanceChance: { type: Type.NUMBER },
                  rationale: { type: Type.STRING },
                },
                required: ["category", "university", "major", "admissionType", "acceptanceChance", "rationale"]
              },
            },
            regularDecisionRecommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  university: { type: Type.STRING },
                  major: { type: Type.STRING },
                  admissionType: { type: Type.STRING },
                  acceptanceChance: { type: Type.NUMBER },
                  rationale: { type: Type.STRING },
                },
                required: ["category", "university", "major", "admissionType", "acceptanceChance", "rationale"]
              },
            },
            localSupport: {
              type: Type.OBJECT,
              properties: {
                weakSubject: { type: Type.STRING },
                recommendedAcademies: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      distance: { type: Type.STRING },
                      rating: { type: Type.NUMBER },
                      reviewCount: { type: Type.NUMBER },
                    },
                    required: ["name", "distance", "rating", "reviewCount"]
                  },
                },
                recommendedStudySpaces: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      type: { type: Type.STRING },
                      distance: { type: Type.STRING },
                      rating: { type: Type.NUMBER },
                    },
                    required: ["name", "type", "distance", "rating"]
                  },
                },
              },
              required: ["weakSubject", "recommendedAcademies", "recommendedStudySpaces"]
            },
          },
          required: [
            "studentName", "recommendedApplicationType", "quantitativeAnalysis", "qualitativeAnalysis",
            "applicationStrategy", "earlyDecisionRecommendations", "regularDecisionRecommendations", "localSupport"
          ]
        },
      },
    });

    // Clean up potential markdown formatting from the response text
    const jsonText = response.text.replace(/^```json\n/, '').replace(/\n```$/, '').trim();
    return JSON.parse(jsonText) as AnalysisReport;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to get analysis from AI. Please check the console for details.");
  }
};