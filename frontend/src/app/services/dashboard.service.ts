import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface DashboardStats {
  totalSubjects: number;
  totalSyllabus: number;
  totalQuestions: number;
  totalPapers: number;
}

export interface RecentPaper {
  id: string;
  title: string;
  subject: string;
  totalMarks: number;
  duration: number;
  questionCount: number;
  createdAt: string;
}

export interface RecentQuestion {
  id: string;
  text: string;
  type: string;
  difficulty: string;
  marks: number;
  subject: string;
  createdAt: string;
}

export interface DashboardResponse {
  stats: DashboardStats;
  recentPapers: RecentPaper[];
  recentQuestions: RecentQuestion[];
  difficultySummary: { Easy: number; Medium: number; Hard: number };
  typeSummary: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly apiUrl = environment.apiUrl;
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  getDashboard(): Observable<DashboardResponse> {
    const token = this.authService.getToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
    return this.http.get<DashboardResponse>(`${this.apiUrl}/dashboard`, {
      headers,
    });
  }
}
