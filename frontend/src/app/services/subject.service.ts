import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface Subject {
  id: string;
  name: string;
  code: string;
  description: string;
  semester: number;
  board?: string;
  classLevel?: string;
  createdAt: string;
}

export interface SubjectsResponse {
  subjects: Subject[];
}

export interface SubjectResponse {
  message: string;
  subject: Subject;
}

@Injectable({ providedIn: 'root' })
export class SubjectService {
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

  getSubjects(search?: string): Observable<SubjectsResponse> {
    let url = `${this.apiUrl}/subjects`;
    if (search && search.trim()) {
      url += `?search=${encodeURIComponent(search.trim())}`;
    }
    return this.http.get<SubjectsResponse>(url, {
      headers: this.getHeaders(),
    });
  }

  getSubject(id: string): Observable<{ subject: Subject }> {
    return this.http.get<{ subject: Subject }>(`${this.apiUrl}/subjects/${id}`, {
      headers: this.getHeaders(),
    });
  }

  createSubject(data: {
    name: string;
    code: string;
    description: string;
    semester: number;
    board?: string;
    classLevel?: string;
  }): Observable<SubjectResponse> {
    return this.http.post<SubjectResponse>(`${this.apiUrl}/subjects`, data, {
      headers: this.getHeaders(),
    });
  }

  updateSubject(
    id: string,
    data: {
      name: string;
      code: string;
      description: string;
      semester: number;
      board?: string;
      classLevel?: string;
    },
  ): Observable<SubjectResponse> {
    return this.http.put<SubjectResponse>(`${this.apiUrl}/subjects/${id}`, data, {
      headers: this.getHeaders(),
    });
  }

  deleteSubject(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/subjects/${id}`, {
      headers: this.getHeaders(),
    });
  }
}
