import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { Observable, tap } from 'rxjs';

export interface User {
  id: string;
  name: string;
  email: string;
  collegeName?: string;
  role?: string;
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ProfileResponse {
  user: User;
}

export interface UpdateProfileRequest {
  name: string;
  email: string;
  collegeName?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = environment.apiUrl;
  private readonly TOKEN_KEY = 'qp_auth_token';
  private readonly USER_KEY = 'qp_auth_user';

  private currentUser = signal<User | null>(this.loadUser());
  private loading = signal(false);

  user = this.currentUser.asReadonly();
  isLoading = this.loading.asReadonly();
  isLoggedIn = computed(() => !!this.currentUser());

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {}

  private loadUser(): User | null {
    this.clearPersistedSessionOnBoot();
    try {
      const userData = sessionStorage.getItem(this.USER_KEY);
      const token = sessionStorage.getItem(this.TOKEN_KEY);
      if (userData && token) {
        return JSON.parse(userData);
      }
    } catch {
      sessionStorage.removeItem(this.TOKEN_KEY);
      sessionStorage.removeItem(this.USER_KEY);
    }
    return null;
  }

  private static bootSessionCleared = false;

  private clearPersistedSessionOnBoot(): void {
    if (AuthService.bootSessionCleared) return;
    AuthService.bootSessionCleared = true;
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    sessionStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.USER_KEY);
  }

  getToken(): string | null {
    return sessionStorage.getItem(this.TOKEN_KEY);
  }

  private getHeaders(): HttpHeaders {
    const token = this.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  }

  private updateUser(user: User) {
    sessionStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
  }

  register(name: string, email: string, password: string, collegeName: string) {
    this.loading.set(true);
    return this.http
      .post<{ message: string }>(`${this.apiUrl}/auth/register`, {
        name,
        email,
        password,
        collegeName,
      })
      .pipe(
        tap({
          next: () => {
            this.loading.set(false);
          },
          error: () => {
            this.loading.set(false);
          },
        }),
      );
  }

  login(email: string, password: string) {
    this.loading.set(true);
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, { email, password }).pipe(
      tap({
        next: (res) => {
          sessionStorage.setItem(this.TOKEN_KEY, res.token);
          sessionStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
          this.currentUser.set(res.user);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
        },
      }),
    );
  }

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    sessionStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.USER_KEY);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  checkAuth(): boolean {
    const token = this.getToken();
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiry = payload.exp * 1000;
      if (Date.now() >= expiry) {
        this.logout();
        return false;
      }
      return true;
    } catch {
      this.logout();
      return false;
    }
  }

  getProfile(): Observable<ProfileResponse> {
    return this.http.get<ProfileResponse>(`${this.apiUrl}/auth/me`, {
      headers: this.getHeaders(),
    });
  }

  updateProfile(data: UpdateProfileRequest): Observable<{ message: string; user: User }> {
    return this.http
      .put<{ message: string; user: User }>(`${this.apiUrl}/auth/profile`, data, {
        headers: this.getHeaders(),
      })
      .pipe(
        tap({
          next: (res) => {
            this.updateUser(res.user);
          },
        }),
      );
  }

  changePassword(data: ChangePasswordRequest): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.apiUrl}/auth/change-password`, data, {
      headers: this.getHeaders(),
    });
  }
}
