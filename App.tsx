import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, LineChart, Line
} from 'recharts';
import type { StudentInfo, AnalysisReport, UniversityRecommendation, RecommendationCategory, ManualAcademicRecord } from './types';
import { analyzeStudentData, extractDataFromImage } from './services/geminiService';

// --- ICONS ---
const UploadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
);
const LocationIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);
const StarIcon: React.FC<{ filled: boolean }> = ({ filled }) => (
    <svg className={`w-4 h-4 ${filled ? 'text-yellow-400' : 'text-gray-300'}`} fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
);

// --- HELPERS ---
const fileToBase64 = (file: File): Promise<{ mimeType: string; data: string }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            const mimeType = result.split(',')[0].split(':')[1].split(';')[0];
            const data = result.split(',')[1];
            resolve({ mimeType, data });
        };
        reader.onerror = (error) => reject(error);
    });
};

const Onboarding: React.FC<{ onComplete: (info: StudentInfo) => void; onRequestLocation: () => void; }> = ({ onComplete, onRequestLocation }) => {
    const [step, setStep] = useState(1);
    const [info, setInfo] = useState<StudentInfo>({
        grade: '', desiredField: '', studentName: '',
        mockExam: { korean: '', math: '', english: '', inquiry1: '', inquiry2: '' }
    });
    const [recordInputType, setRecordInputType] = useState<'image' | 'manual' | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isExtracting, setIsExtracting] = useState(false);

    const handleNext = () => setStep(s => s + 1);
    const handlePrev = () => setStep(s => s - 1);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name in info.mockExam) {
            setInfo(prev => ({ ...prev, mockExam: { ...prev.mockExam, [name]: value } }));
        } else if (info.manualAcademicRecord && name in info.manualAcademicRecord) {
             setInfo(prev => ({ ...prev, manualAcademicRecord: { ...prev.manualAcademicRecord!, [name]: value } }));
        }
        else {
            setInfo(prev => ({ ...prev, [name]: value as any }));
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsExtracting(true);
            setRecordInputType('image');
            setImagePreview(URL.createObjectURL(file));
            const { mimeType, data } = await fileToBase64(file);
            const imagePayload = { mimeType, data };
            setInfo(prev => ({ ...prev, academicRecordImage: imagePayload }));

            try {
                const { studentName, manualRecord } = await extractDataFromImage(imagePayload);
                setInfo(prev => ({
                    ...prev,
                    studentName: studentName,
                    manualAcademicRecord: manualRecord
                }));
                setRecordInputType('manual'); 
            } catch (error) {
                console.error(error);
                alert((error as Error).message);
                setRecordInputType('image');
            } finally {
                setIsExtracting(false);
            }
        }
    };
    
    const handleManualSelect = () => {
        setRecordInputType('manual');
        setInfo(prev => ({...prev, manualAcademicRecord: { awards: '', creativeActivities: '', detailedAbilities: '', readingActivities: '', behavioralCharacteristics: ''}}))
    }

    const handleSkipMockExam = () => {
        const confirmed = window.confirm("모의고사 성적 입력을 건너뛰시겠습니까? 이 경우, AI가 학생 생활기록부 내용을 바탕으로 학업 수준을 추정하여 분석을 진행합니다.");
        if (confirmed) {
            handleNext();
        }
    };

    const isStepComplete = () => {
        switch (step) {
            case 1:
                return info.grade !== '' && info.desiredField.trim() !== '';
            case 2:
                // Step 2 is complete only when there is some data in the manual record fields,
                // regardless of whether it came from image extraction or direct input.
                const record = info.manualAcademicRecord;
                if (!record || typeof record !== 'object') {
                    return false;
                }
                return Object.values(record).some(value => typeof value === 'string' && value.trim() !== '');
            case 3:
                // This validation is for the "Next" button, which is used when the user *fills* the form.
                // The "Skip" button has its own separate handler.
                const mockExam = info.mockExam;
                // Defensively check if mockExam is a non-null object before using Object.values
                if (!mockExam || typeof mockExam !== 'object') {
                    return false;
                }
                const scores = Object.values(mockExam);
                // Check if every value is a string and not empty.
                return scores.every(score => typeof score === 'string' && score.trim() !== '');
            default:
                return false;
        }
    };

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-4">기본 정보 입력</h2>
                        <p className="text-slate-600 mb-6">자녀의 학년과 희망 계열을 알려주세요.</p>
                        <div className="space-y-4">
                            <select name="grade" value={info.grade} onChange={handleChange} className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                <option value="">학년 선택</option><option value="1">고등학교 1학년</option><option value="2">고등학교 2학년</option><option value="3">고등학교 3학년</option>
                            </select>
                            <input type="text" name="desiredField" value={info.desiredField} onChange={handleChange} placeholder="희망 계열 (예: 컴퓨터공학, 의예과)" className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                        </div>
                    </div>
                );
            case 2:
                return (
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-4">학생 생활기록부</h2>
                        {isExtracting ? (
                             <div className="text-center p-8 flex flex-col items-center justify-center">
                                <svg className="animate-spin h-12 w-12 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <h3 className="text-lg font-semibold text-blue-600">AI가 이미지를 분석하여 텍스트를 추출하고 있습니다...</h3>
                                <p className="text-slate-500 mt-1">잠시만 기다려주세요.</p>
                            </div>
                        ) : (
                            <>
                                <p className="text-slate-600 mb-6">어떻게 학생부 정보를 입력하시겠어요?</p>
                                {!recordInputType && (
                                    <div className="flex gap-4">
                                        <button onClick={() => setRecordInputType('image')} className="flex-1 p-6 border-2 border-dashed rounded-lg text-center hover:bg-slate-100 hover:border-blue-500">
                                            <h3 className="font-bold text-lg">이미지 파일 업로드</h3>
                                            <p className="text-sm text-slate-500">가장 정확하고 간편한 방법입니다.</p>
                                        </button>
                                        <button onClick={handleManualSelect} className="flex-1 p-6 border-2 border-dashed rounded-lg text-center hover:bg-slate-100 hover:border-blue-500">
                                            <h3 className="font-bold text-lg">직접 입력하기</h3>
                                            <p className="text-sm text-slate-500">주요 항목을 직접 입력합니다.</p>
                                        </button>
                                    </div>
                                )}
                                {recordInputType === 'image' && (
                                    <div>
                                        <input type="file" id="file-upload" className="hidden" onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" />
                                        <label htmlFor="file-upload" className="cursor-pointer w-full p-8 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-center hover:border-blue-500 bg-slate-50">
                                            {imagePreview ? (
                                                <img src={imagePreview} alt="학생부 미리보기" className="max-h-40 rounded-lg" />
                                            ) : (
                                                <>
                                                    <UploadIcon />
                                                    <p className="font-semibold">클릭하여 파일 선택 또는 드래그</p>
                                                    <p className="text-xs text-slate-500">PNG, JPG, WEBP 지원</p>
                                                </>
                                            )}
                                        </label>
                                        {imagePreview && <button onClick={() => { setImagePreview(null); setInfo(p => ({...p, academicRecordImage: undefined})) }} className="text-sm text-red-500 mt-2">이미지 변경</button>}
                                    </div>
                                )}
                                {recordInputType === 'manual' && info.manualAcademicRecord && (
                                   <div className="space-y-3">
                                       {info.academicRecordImage ? (
                                           <p className="text-sm text-slate-600 mb-4 bg-blue-50 p-3 rounded-lg border border-blue-200">
                                               <span className="font-bold">✅ AI 추출 완료!</span><br/>
                                               이미지에서 추출된 내용입니다. 정확성을 위해 검토 후 필요시 수정해주세요.
                                           </p>
                                       ) : (
                                            <p className="text-sm text-slate-500">학생부의 핵심 내용을 요약하여 입력해주세요.</p>
                                       )}
                                       <textarea name="detailedAbilities" value={info.manualAcademicRecord.detailedAbilities} onChange={handleChange} rows={3} placeholder="세부능력 및 특기사항 (과목별 성취, 탐구활동 등)" className="w-full p-2 border border-slate-300 rounded-lg"/>
                                       <textarea name="creativeActivities" value={info.manualAcademicRecord.creativeActivities} onChange={handleChange} rows={3} placeholder="창의적 체험활동 (동아리, 자율, 봉사, 진로활동)" className="w-full p-2 border border-slate-300 rounded-lg"/>
                                       <textarea name="behavioralCharacteristics" value={info.manualAcademicRecord.behavioralCharacteristics} onChange={handleChange} rows={3} placeholder="행동특성 및 종합의견 (담임교사 의견)" className="w-full p-2 border border-slate-300 rounded-lg"/>
                                       <textarea name="awards" value={info.manualAcademicRecord.awards} onChange={handleChange} rows={2} placeholder="수상경력" className="w-full p-2 border border-slate-300 rounded-lg"/>
                                       <textarea name="readingActivities" value={info.manualAcademicRecord.readingActivities} onChange={handleChange} rows={2} placeholder="독서활동상황" className="w-full p-2 border border-slate-300 rounded-lg"/>
                                   </div>
                                )}
                             </>
                        )}
                    </div>
                );
            case 3:
                return (
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-4">최근 모의고사 성적</h2>
                        <p className="text-slate-600 mb-6">가장 최근 모의고사 성적의 백분위 또는 표준점수를 입력해주세요.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input type="text" name="korean" value={info.mockExam.korean} onChange={handleChange} placeholder="국어" className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            <input type="text" name="math" value={info.mockExam.math} onChange={handleChange} placeholder="수학" className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            <input type="text" name="english" value={info.mockExam.english} onChange={handleChange} placeholder="영어 (등급)" className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            <input type="text" name="inquiry1" value={info.mockExam.inquiry1} onChange={handleChange} placeholder="탐구 1" className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            <input type="text" name="inquiry2" value={info.mockExam.inquiry2} onChange={handleChange} placeholder="탐구 2" className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                        </div>
                    </div>
                );
            case 4:
                return (
                     <div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-4">위치 정보 동의 (선택)</h2>
                        <p className="text-slate-600 mb-6">더 정확한 주변 학원 및 학습 공간 추천을 위해 현재 위치 정보 제공에 동의해주시겠어요?</p>
                        <button onClick={onRequestLocation} className="w-full flex items-center justify-center p-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors">
                            <LocationIcon /> 위치 정보 제공 동의
                        </button>
                        <p className="text-sm text-slate-500 mt-4 text-center">동의하지 않으셔도 분석은 가능하지만, 지역 기반 추천은 제한됩니다.</p>
                    </div>
                )
        }
    };
    
    const progress = (step / 4) * 100;

    return (
        <div className="max-w-2xl mx-auto p-4 md:p-8">
            <div className="bg-white rounded-2xl shadow-2xl p-8 transform transition-all hover:scale-[1.01] duration-500">
                <div className="w-full bg-slate-200 rounded-full h-2.5 mb-6">
                    <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                </div>
                {renderStep()}
                <div className="flex justify-between items-center mt-8">
                    {step > 1 ? (
                        <button onClick={handlePrev} className="px-6 py-2 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300">이전</button>
                    ) : <div />}
                    
                    <div className="flex items-center gap-2">
                        {step === 3 && (
                            <button 
                                onClick={handleSkipMockExam} 
                                className="px-6 py-2 text-slate-600 rounded-lg hover:bg-slate-200 border border-slate-300 transition-colors"
                            >
                                건너뛰기
                            </button>
                        )}
                        
                        {step < 4 && !isExtracting && (
                            <button 
                                onClick={handleNext} 
                                disabled={!isStepComplete()} 
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                            >
                                다음
                            </button>
                        )}
                        
                        {step === 4 && (
                            <button 
                                onClick={() => onComplete(info)} 
                                className="px-6 py-2 bg-blue-800 text-white rounded-lg hover:bg-blue-900"
                            >
                                AI 분석 시작하기
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const ReportDashboard: React.FC<{ report: AnalysisReport }> = ({ report }) => {
    const [activeTab, setActiveTab] = useState('dashboard');
    
    const pieData = [
        { name: '수시', value: report.applicationStrategy?.earlyDecisionProbability ?? 50 },
        { name: '정시', value: report.applicationStrategy?.regularDecisionProbability ?? 50 },
    ];
    const PIE_COLORS = ['#0088FE', '#00C49F'];

    const getCategoryColor = (category: RecommendationCategory) => {
        switch (category) {
            case '상향': return 'bg-red-100 text-red-800 border-red-500';
            case '적정': return 'bg-yellow-100 text-yellow-800 border-yellow-500';
            case '안정': return 'bg-green-100 text-green-800 border-green-500';
            default: return 'bg-gray-100 text-gray-800 border-gray-500';
        }
    };
    
    const renderRecommendationCard = (rec: UniversityRecommendation, index: number) => (
        <div key={index} className={`border-l-4 p-4 rounded-lg shadow-sm ${getCategoryColor(rec.category)}`}>
            <div className="flex justify-between items-start">
                <div>
                    <span className={`text-sm font-bold px-2 py-1 rounded-full ${getCategoryColor(rec.category)}`}>{rec.category}</span>
                    <h3 className="text-lg font-bold mt-2">{rec.university} - {rec.major}</h3>
                    <p className="text-sm text-slate-600">{rec.admissionType}</p>
                </div>
                <div className="text-right">
                    <p className="text-xl font-bold text-blue-700">{rec.acceptanceChance}%</p>
                    <p className="text-xs text-slate-500">예상 합격률</p>
                </div>
            </div>
            <p className="mt-3 text-sm text-slate-700 bg-white/50 p-3 rounded-md">{rec.rationale}</p>
        </div>
    );

    const renderDashboard = () => (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3 bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-xl font-bold text-slate-800">핵심 진단 요약</h3>
          <p className="text-slate-600">{report?.studentName || "학생"}, {report?.recommendedApplicationType || "분석 결과"}이 유리합니다.</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">수시 vs 정시 유불리</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">내신 성적 추이 (GPA)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={report?.quantitativeAnalysis?.gradeTrend ?? []}>
              <XAxis dataKey="semester" />
              <YAxis domain={[1, 5]} reversed={true}/>
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="gpa" stroke="#8884d8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">4대 역량 분석</h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={report?.qualitativeAnalysis?.competencyRadar ?? []}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" />
              <PolarRadiusAxis angle={30} domain={[0, 5]} />
              <Radar name={report.studentName || '학생'} dataKey="score" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">학생부 키워드 클라우드</h3>
          <div className="flex flex-wrap gap-2 items-center justify-center h-full">
            {(report?.qualitativeAnalysis?.keywordCloud ?? []).map((word, i) => (
              <span key={i} className="text-white rounded-full px-3 py-1 bg-blue-500" style={{ fontSize: `${10 + word.value * 1.5}px`, opacity: 0.6 + word.value * 0.04 }}>
                {word.text}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
    
    const renderStrategy = () => (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-2xl font-bold mb-4 text-slate-800">수시 6카드 추천</h2>
          <div className="space-y-4">{(report?.earlyDecisionRecommendations ?? []).map(renderRecommendationCard)}</div>
        </div>
        <div>
          <h2 className="text-2xl font-bold mb-4 text-slate-800">정시 3카드 추천</h2>
          <div className="space-y-4">{(report?.regularDecisionRecommendations ?? []).map(renderRecommendationCard)}</div>
        </div>
      </div>
    );

    const renderLocalSupport = () => {
        return (
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-2xl font-bold mb-2 text-slate-800">지역 기반 학업 지원 솔루션</h2>
                {report?.localSupport ? (
                    <>
                        <p className="mb-6 text-slate-600">
                            AI 분석 결과, {report.studentName} 학생은 <span className="font-bold text-blue-600">{report.localSupport.weakSubject}</span> 보완이 시급합니다.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <h3 className="text-xl font-semibold mb-4 text-slate-700">약점 보완 전문 학원 추천</h3>
                                <div className="space-y-4">
                                    {(report.localSupport.recommendedAcademies ?? []).map((item, i) => (
                                        <div key={i} className="p-4 border rounded-lg transition-all hover:bg-slate-50">
                                            <div className="flex justify-between items-center">
                                                <h4 className="font-bold">{item.name}</h4>
                                                <span className="text-sm font-medium text-slate-500">{item.distance}</span>
                                            </div>
                                            <div className="flex items-center mt-1">
                                                <div className="flex">
                                                    {[...Array(5)].map((_, idx) => <StarIcon key={idx} filled={idx < Math.round(item.rating)} />)}
                                                </div>
                                                <span className="text-xs text-slate-500 ml-2">({item.rating.toFixed(1)}, 리뷰 {item.reviewCount})</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold mb-4 text-slate-700">학습 공간 추천</h3>
                                <div className="space-y-4">
                                    {(report.localSupport.recommendedStudySpaces ?? []).map((item, i) => (
                                        <div key={i} className="p-4 border rounded-lg transition-all hover:bg-slate-50">
                                            <div className="flex justify-between items-center">
                                                <h4 className="font-bold">{item.name}</h4>
                                                <span className="text-sm font-medium text-slate-500">{item.distance}</span>
                                            </div>
                                            <div className="flex items-center mt-1">
                                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.type === 'Library' ? 'bg-indigo-100 text-indigo-800' : 'bg-teal-100 text-teal-800'}`}>
                                                    {item.type === 'Library' ? '도서관' : '스터디 카페'}
                                                </span>
                                                <div className="flex ml-4">
                                                    {[...Array(5)].map((_, idx) => <StarIcon key={idx} filled={idx < Math.round(item.rating)} />)}
                                                </div>
                                                <span className="text-xs text-slate-500 ml-2">({item.rating.toFixed(1)})</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </>
                ) : <p className="text-slate-500">지역 기반 지원 정보를 불러올 수 없습니다.</p>}
            </div>
        );
    }

    const tabs = [
        { id: 'dashboard', label: '종합 대시보드' },
        { id: 'strategy', label: '맞춤 합격 전략' },
        { id: 'local', label: '지역 학업 지원' },
    ];

    return (
      <div className="p-4 md:p-8">
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`${activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
        
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'strategy' && renderStrategy()}
        {activeTab === 'local' && renderLocalSupport()}
      </div>
    );
};


export default function App() {
    type AppStep = 'WELCOME' | 'ONBOARDING' | 'ANALYZING' | 'REPORT' | 'ERROR';
    const [step, setStep] = useState<AppStep>('WELCOME');
    const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
    const [analysisReport, setAnalysisReport] = useState<AnalysisReport | null>(null);
    const [location, setLocation] = useState<{ latitude: number, longitude: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    
    const handleLocationRequest = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setLocation({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    });
                    alert('위치 정보가 성공적으로 수집되었습니다.');
                },
                (error) => {
                    console.error("Geolocation error:", error);
                    alert('위치 정보를 가져오는데 실패했습니다.');
                }
            );
        } else {
            alert('이 브라우저에서는 위치 정보가 지원되지 않습니다.');
        }
    };

    const handleOnboardingComplete = useCallback(async (info: StudentInfo) => {
        setStudentInfo(info);
        setStep('ANALYZING');
        setError(null);
        try {
            const report = await analyzeStudentData(info, location);
            setAnalysisReport(report);
            setStep('REPORT');
        } catch (e) {
            console.error(e);
            const err = e as Error;
            setError(err.message || 'An unknown error occurred.');
            setStep('ERROR');
        }
    }, [location]);

    const reset = () => {
        setStep('WELCOME');
        setStudentInfo(null);
        setAnalysisReport(null);
        setError(null);
        setLocation(null);
    };

    const renderContent = () => {
        switch (step) {
            case 'WELCOME':
                return (
                    <div className="text-center p-8">
                        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-800 mb-4">입시 네비게이터 AI</h1>
                        <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8">
                            복잡한 입시, AI와 함께 명쾌한 해답을 찾으세요. <br />
                            자녀의 학생부를 기반으로 정확한 진단과 맞춤형 합격 전략을 제공합니다.
                        </p>
                        <button onClick={() => setStep('ONBOARDING')} className="bg-blue-600 text-white font-bold py-3 px-8 rounded-full text-lg hover:bg-blue-700 transition-transform transform hover:scale-105 shadow-lg">
                            무료 분석 시작하기
                        </button>
                    </div>
                );
            case 'ONBOARDING':
                return <Onboarding onComplete={handleOnboardingComplete} onRequestLocation={handleLocationRequest} />;
            case 'ANALYZING':
                return (
                    <div className="text-center p-8 flex flex-col items-center justify-center">
                        <svg className="animate-spin h-16 w-16 text-blue-600 mb-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <h2 className="text-2xl font-bold text-slate-800">AI가 학생부를 정밀 분석 중입니다...</h2>
                        <p className="text-slate-600 mt-2">잠시만 기다려 주세요. 이미지 분석 시 약 1-2분 정도 소요될 수 있습니다.</p>
                    </div>
                );
            case 'REPORT':
                return analysisReport ? <ReportDashboard report={analysisReport} /> : null;
            case 'ERROR':
                return (
                    <div className="text-center p-8">
                        <h2 className="text-2xl font-bold text-red-600">분석 중 오류 발생</h2>
                        <p className="text-slate-600 my-4">{error}</p>
                        <button onClick={reset} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700">
                            처음으로 돌아가기
                        </button>
                    </div>
                );
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
            <header className="bg-white shadow-md">
                <div className="container mx-auto px-4 py-4 flex justify-between items-center">
                    <div className="text-2xl font-bold text-blue-700">Admissions Navigator AI</div>
                    {step !== 'WELCOME' && (
                        <button onClick={reset} className="text-sm text-slate-600 hover:text-blue-600">
                            다시 시작하기
                        </button>
                    )}
                </div>
            </header>
            <main className="container mx-auto px-4 py-8">
                {renderContent()}
            </main>
             <footer className="text-center py-4 text-xs text-slate-500">
                © 2024 Admissions Navigator AI. All rights reserved. This is an AI-generated analysis and should be used for reference purposes only.
            </footer>
        </div>
    );
}