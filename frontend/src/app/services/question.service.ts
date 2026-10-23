import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface Question {
  id: string;
  text: string;
  type: string;
  difficulty: string;
  options: string[];
  answer: string;
  marks: number;
  topic: string;
  source: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  paperId?: string | null;
  createdAt: string;
}

export interface QuestionsResponse {
  questions: Question[];
}

export interface QuestionResponse {
  message: string;
  question: Question;
}

@Injectable({ providedIn: 'root' })
export class QuestionService {
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

  getQuestions(filters?: {
    search?: string;
    subjectId?: string;
    difficulty?: string;
    type?: string;
    topic?: string;
    paperId?: string;
  }): Observable<QuestionsResponse> {
    let params = new HttpParams();
    if (filters) {
      if (filters.search && filters.search.trim()) {
        params = params.set('search', filters.search.trim());
      }
      if (filters.subjectId) {
        params = params.set('subjectId', filters.subjectId);
      }
      if (filters.difficulty) {
        params = params.set('difficulty', filters.difficulty);
      }
      if (filters.type) {
        params = params.set('type', filters.type);
      }
      if (filters.topic && filters.topic.trim()) {
        params = params.set('topic', filters.topic.trim());
      }
      if (filters.paperId) {
        params = params.set('paperId', filters.paperId);
      }
    }
    return this.http.get<QuestionsResponse>(`${this.apiUrl}/questions`, {
      headers: this.getHeaders(),
      params,
    });
  }

  getQuestion(id: string): Observable<{ question: Question }> {
    return this.http.get<{ question: Question }>(`${this.apiUrl}/questions/${id}`, {
      headers: this.getHeaders(),
    });
  }

  createQuestion(data: {
    text: string;
    type: string;
    difficulty: string;
    options?: string[];
    answer?: string;
    marks: number;
    topic?: string;
    source?: string;
    subjectId: string;
  }): Observable<QuestionResponse> {
    return this.http.post<QuestionResponse>(`${this.apiUrl}/questions`, data, {
      headers: this.getHeaders(),
    });
  }

  updateQuestion(
    id: string,
    data: {
      text: string;
      type: string;
      difficulty: string;
      options?: string[];
      answer?: string;
      marks: number;
      topic?: string;
      source?: string;
      subjectId: string;
    },
  ): Observable<QuestionResponse> {
    return this.http.put<QuestionResponse>(`${this.apiUrl}/questions/${id}`, data, {
      headers: this.getHeaders(),
    });
  }

  deleteQuestion(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/questions/${id}`, {
      headers: this.getHeaders(),
    });
  }
}
