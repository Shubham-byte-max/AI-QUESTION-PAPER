import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface GeneratedQuestion {
  id?: string;
  text: string;
  type: string;
  difficulty: string;
  options: string[];
  answer: string;
  correctAnswer?: string;
  marks: number;
  topic: string;
  source: string;
  selected?: boolean;
  editing?: boolean;
}

export interface GenerateRequest {
  subjectId: string;
  syllabusId?: string;
  topic?: string;
  count: number;
  difficulty: string;
  type: string;
  marks: number;
  instructions?: string;
}

export interface GenerateResponse {
  message: string;
  questions: GeneratedQuestion[];
  warnings?: string[];
}

export interface GenerateSetsRequest extends GenerateRequest {
  setCount?: number;
}

export interface GeneratedPaperSet {
  setLabel: string;
  title: string;
  subjectId: string;
  syllabusId?: string | null;
  totalMarks: number;
  duration: number;
  questions: GeneratedQuestion[];
}

export interface GenerateSetsResponse {
  message: string;
  sets: GeneratedPaperSet[];
  warnings?: string[];
}

export interface SaveGeneratedRequest {
  subjectId: string;
  questions: GeneratedQuestion[];
}

export interface SaveGeneratedResponse {
  message: string;
  saved: { id: string; text: string }[];
  skipped: { text: string; reason: string }[];
}

@Injectable({ providedIn: 'root' })
export class AiGeneratorService {
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

  generateQuestions(config: GenerateRequest): Observable<GenerateResponse> {
    // Send the exact selected type AND difficulty under explicit keys so the
    // backend always receives the user's selection - never a default such as
    // "Short Answer" or "Medium".
    return this.http.post<GenerateResponse>(
      `${this.apiUrl}/questions/generate`,
      { ...config, questionType: config.type, difficulty: config.difficulty },
      { headers: this.getHeaders() },
    );
  }

  generateSets(config: GenerateSetsRequest): Observable<GenerateSetsResponse> {
    return this.http.post<GenerateSetsResponse>(
      `${this.apiUrl}/questions/generate-sets`,
      { ...config, questionType: config.type, difficulty: config.difficulty },
      { headers: this.getHeaders() },
    );
  }

  saveGeneratedQuestions(data: SaveGeneratedRequest): Observable<SaveGeneratedResponse> {
    return this.http.post<SaveGeneratedResponse>(`${this.apiUrl}/questions/save-generated`, data, {
      headers: this.getHeaders(),
    });
  }
}
