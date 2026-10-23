import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface Syllabus {
  id: string;
  title: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  topics: { name: string; weightage: number }[];
  content: string;
  sourceType: string;
  sourceFileName: string;
  createdAt: string;
}

export interface SyllabiResponse {
  syllabi: Syllabus[];
}

export interface SyllabusResponse {
  message: string;
  syllabus: Syllabus;
}

@Injectable({ providedIn: 'root' })
export class SyllabusService {
  private readonly apiUrl = environment.apiUrl;
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
  }

  getSyllabi(search?: string, subjectId?: string): Observable<SyllabiResponse> {
    let params = new HttpParams();
    if (search && search.trim()) {
      params = params.set('search', search.trim());
    }
    if (subjectId) {
      params = params.set('subjectId', subjectId);
    }
    return this.http.get<SyllabiResponse>(`${this.apiUrl}/syllabus`, {
      headers: this.getHeaders(),
      params,
    });
  }

  getSyllabus(id: string): Observable<{ syllabus: Syllabus }> {
    return this.http.get<{ syllabus: Syllabus }>(`${this.apiUrl}/syllabus/${id}`, {
      headers: this.getHeaders(),
    });
  }

  createSyllabus(data: {
    title: string;
    subjectId: string;
    topics?: { name: string; weightage: number }[];
    content?: string;
  }): Observable<SyllabusResponse> {
    return this.http.post<SyllabusResponse>(`${this.apiUrl}/syllabus`, data, {
      headers: this.getHeaders().set('Content-Type', 'application/json'),
    });
  }

  updateSyllabus(
    id: string,
    data: {
      title: string;
      subjectId: string;
      topics?: { name: string; weightage: number }[];
      content?: string;
    },
  ): Observable<SyllabusResponse> {
    return this.http.put<SyllabusResponse>(`${this.apiUrl}/syllabus/${id}`, data, {
      headers: this.getHeaders().set('Content-Type', 'application/json'),
    });
  }

  deleteSyllabus(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/syllabus/${id}`, {
      headers: this.getHeaders(),
    });
  }

  uploadSyllabus(title: string, subjectId: string, file: File): Observable<SyllabusResponse> {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('subjectId', subjectId);
    formData.append('file', file);

    return this.http.post<SyllabusResponse>(`${this.apiUrl}/syllabus/upload`, formData, {
      headers: this.getHeaders(),
    });
  }
}
