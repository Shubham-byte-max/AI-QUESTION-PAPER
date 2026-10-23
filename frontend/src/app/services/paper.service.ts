import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface PaperQuestion {
  id: string;
  text: string;
  type: string;
  difficulty: string;
  options: string[];
  answer: string;
  marks: number;
  topic: string;
  source?: string;
  section?: string;
  paperId?: string | null;
  regenerating?: boolean;
}

export interface SectionDetail {
  name: string;
  questionType: string;
  questionCount: number;
  attemptQuestions?: number;
  marksPerQuestion: number;
  difficulty: string;
  requiredMarks: number;
  instruction?: string;
}

export interface Paper {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  semester?: number;

  board?: string;
  classLevel?: string;
  questions: PaperQuestion[];
  totalMarks: number;
  duration: number;
  questionCount: number;
  examPattern?: string;
  examPatternId?: string | null;
  syllabus?: string;
  syllabusId?: string | null;
  instructions?: string;
  sectionDetails?: SectionDetail[];
  setLabel?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PapersResponse {
  papers: Paper[];
}

export interface GeneratePaperRequest {
  title: string;
  subjectId: string;
  syllabusId?: string;
  examPatternId?: string;
  totalMarks: number;
  duration: number;
  difficulty?: string;
  questionTypes: string[];
  numberOfQuestions: number;
  unitDistribution: { topic: string; count: number; type?: string }[];
  instructions?: string;
  setCount?: number;
}

export interface GeneratePaperResponse {
  message: string;
  paper: {
    title: string;
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    semester?: number;
    board?: string;
    classLevel?: string;
    totalMarks: number;
    duration: number;
    questions: PaperQuestion[];
    actualTotalMarks: number;
    sectionDetails: SectionDetail[];
    examPattern?: string | null;
    examPatternId?: string | null;
    syllabusId?: string | null;
    setLabel?: string;
  };
  papers?: {
    title: string;
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    semester?: number;
    board?: string;
    classLevel?: string;
    totalMarks: number;
    duration: number;
    questions: PaperQuestion[];
    actualTotalMarks: number;
    sectionDetails: SectionDetail[];
    examPattern?: string | null;
    examPatternId?: string | null;
    syllabusId?: string | null;
    setLabel?: string;
  }[];
  warnings: string[];
}

export interface SavePaperRequest {
  title: string;
  subjectId: string;
  questionIds?: string[];
  questions?: PaperQuestion[];
  totalMarks: number;
  duration: number;
  examPattern?: string;
  syllabus?: string;
  instructions?: string;
  sectionDetails?: SectionDetail[];
}

@Injectable({ providedIn: 'root' })
export class PaperService {
  private readonly apiUrl = environment.apiUrl;
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  }

  getPapers(search?: string): Observable<PapersResponse> {
    let url = `${this.apiUrl}/papers`;
    if (search && search.trim()) {
      url += `?search=${encodeURIComponent(search.trim())}`;
    }
    return this.http.get<PapersResponse>(url, { headers: this.getHeaders() });
  }

  getPaper(id: string): Observable<{ paper: Paper }> {
    return this.http.get<{ paper: Paper }>(`${this.apiUrl}/papers/${id}`, {
      headers: this.getHeaders(),
    });
  }

  generatePaper(config: GeneratePaperRequest): Observable<GeneratePaperResponse> {
    return this.http.post<GeneratePaperResponse>(`${this.apiUrl}/papers/generate`, config, {
      headers: this.getHeaders(),
    });
  }

  savePaper(
    data: SavePaperRequest,
  ): Observable<{ message: string; paper: { id: string; title: string } }> {
    return this.http.post<{ message: string; paper: { id: string; title: string } }>(
      `${this.apiUrl}/papers`,
      data,
      { headers: this.getHeaders() },
    );
  }

  updatePaper(id: string, data: SavePaperRequest): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.apiUrl}/papers/${id}`, data, {
      headers: this.getHeaders(),
    });
  }

  deletePaper(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/papers/${id}`, {
      headers: this.getHeaders(),
    });
  }

  regenerateQuestion(config: {
    subjectId: string;
    type: string;
    difficulty: string;
    marks: number;
    topic?: string;
    instructions?: string;
  }): Observable<{ question: PaperQuestion }> {
    return this.http.post<{ question: PaperQuestion }>(
      `${this.apiUrl}/papers/regenerate-question`,
      config,
      { headers: this.getHeaders() },
    );
  }
}
