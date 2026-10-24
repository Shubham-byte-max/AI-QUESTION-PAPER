import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  loginForm: FormGroup;
  showPassword = signal(false);
  errorMessage = signal('');
  isSubmitting = signal(false);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  togglePasswordVisibility() {
    this.showPassword.update((v) => !v);
  }

  get f() {
    return this.loginForm.controls;
  }

  onSubmit() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.isSubmitting.set(true);

    const { email, password } = this.loginForm.value;

    this.authService.login(email, password).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err: { status?: number; error?: { message?: string }; message?: string }) => {
        this.isSubmitting.set(false);

        if (err.status === 0) {
          this.errorMessage.set(
            `Unable to connect to the backend server. Please check that the backend is running at ${environment.apiUrl}.`,
          );
          return;
        }
        const msg = err.error?.message || 'Login failed. Please try again.';
        // Convert raw browser network error into a friendly message
        if (msg === 'Failed to fetch' || err.message === 'Failed to fetch') {
          this.errorMessage.set(
            `Unable to connect to the backend server. Please check that the backend is running at ${environment.apiUrl}.`,
          );
        } else {
          this.errorMessage.set(msg);
        }
      },
    });
  }
}
