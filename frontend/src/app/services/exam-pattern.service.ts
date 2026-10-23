import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface PatternSection {
  id?: string;
  name: string;
  questionType: string;
  questionCount: number;
  attemptQuestions?: number;
  marksPerQuestion: number;
  difficulty: string;
  instruction?: string;
}

export interface ExamPattern {
  id: string;
  patternName: string;
  totalMarks: number;
  duration: number;
  sections: PatternSection[];
  calculatedMarks?: number;
  subjectId?: string | null;
  createdAt: string;
}

export interface PatternsResponse {
  patterns: ExamPattern[];
}

export interface PatternResponse {
  message: string;
  pattern: ExamPattern;
}

@Injectable({ providedIn: 'root' })
export class ExamPatternService {
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

  getPatterns(search?: string): Observable<PatternsResponse> {
    let url = `${this.apiUrl}/exam-patterns`;
    if (search && search.trim()) {
      url += `?search=${encodeURIComponent(search.trim())}`;
    }
    return this.http.get<PatternsResponse>(url, { headers: this.getHeaders() });
  }

  getPattern(id: string): Observable<{ pattern: ExamPattern }> {
    return this.http.get<{ pattern: ExamPattern }>(`${this.apiUrl}/exam-patterns/${id}`, {
      headers: this.getHeaders(),
    });
  }

  createPattern(data: {
    patternName: string;
    totalMarks: number;
    duration: number;
    sections: PatternSection[];
    subjectId?: string | null;
  }): Observable<PatternResponse> {
    return this.http.post<PatternResponse>(`${this.apiUrl}/exam-patterns`, data, {
      headers: this.getHeaders(),
    });
  }

  updatePattern(
    id: string,
    data: {
      patternName: string;
      totalMarks: number;
      duration: number;
      sections: PatternSection[];
      subjectId?: string | null;
    },
  ): Observable<PatternResponse> {
    return this.http.put<PatternResponse>(`${this.apiUrl}/exam-patterns/${id}`, data, {
      headers: this.getHeaders(),
    });
  }

  deletePattern(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/exam-patterns/${id}`, {
      headers: this.getHeaders(),
    });
  }
}
