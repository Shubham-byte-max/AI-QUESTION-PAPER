import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent {
  registerForm: FormGroup;
  showPassword = signal(false);
  showConfirmPassword = signal(false);
  successMessage = signal('');
  errorMessage = signal('');
  isSubmitting = signal(false);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
  ) {
    this.registerForm = this.fb.group(
      {
        name: ['', [Validators.required, Validators.minLength(2)]],
        collegeName: ['', [Validators.required]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator },
    );
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');
    if (password && confirmPassword && password.value !== confirmPassword.value) {
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }
    return null;
  }

  togglePasswordVisibility() {
    this.showPassword.update((v) => !v);
  }

  toggleConfirmPasswordVisibility() {
    this.showConfirmPassword.update((v) => !v);
  }

  get f() {
    return this.registerForm.controls;
  }

  onSubmit() {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');
    this.isSubmitting.set(true);

    const { name, email, password, collegeName } = this.registerForm.value;

    this.authService.register(name, email, password, collegeName).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.successMessage.set(res.message || 'Registration successful. Please login.');
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 2000);
      },
      error: (err: { status?: number; error?: { message?: string }; message?: string }) => {
        this.isSubmitting.set(false);
        if (err.status === 0) {
          this.errorMessage.set(
            `Unable to connect to the backend server. Please check that the backend is running at ${environment.apiUrl}.`,
          );
          return;
        }
        const msg = err.error?.message || 'Registration failed. Please try again.';
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
