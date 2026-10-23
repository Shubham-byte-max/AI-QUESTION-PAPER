import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent {
  authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private router = inject(Router);

  passwordForm: FormGroup;
  showCurrentPassword = signal(false);
  showNewPassword = signal(false);
  showConfirmPassword = signal(false);
  isSubmittingPassword = signal(false);
  passwordSuccess = signal('');
  passwordError = signal('');
  showLogoutConfirm = signal(false);

  constructor() {
    this.passwordForm = this.fb.group(
      {
        currentPassword: ['', [Validators.required]],
        newPassword: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator },
    );
  }

  passwordMatchValidator(form: FormGroup) {
    const newPass = form.get('newPassword')?.value;
    const confirmPass = form.get('confirmPassword')?.value;
    if (newPass && confirmPass && newPass !== confirmPass) {
      return { passwordMismatch: true };
    }
    return null;
  }

  toggleCurrentPassword() {
    this.showCurrentPassword.update((v) => !v);
  }

  toggleNewPassword() {
    this.showNewPassword.update((v) => !v);
  }

  toggleConfirmPassword() {
    this.showConfirmPassword.update((v) => !v);
  }

  changePassword() {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.passwordError.set('');
    this.passwordSuccess.set('');
    this.isSubmittingPassword.set(true);

    const { currentPassword, newPassword } = this.passwordForm.value;

    this.authService.changePassword({ currentPassword, newPassword }).subscribe({
      next: () => {
        this.isSubmittingPassword.set(false);
        this.passwordSuccess.set('Password changed successfully.');
        this.passwordForm.reset();
      },
      error: (err) => {
        this.isSubmittingPassword.set(false);
        this.passwordError.set(
          err.error?.message || 'Failed to change password. Please try again.',
        );
      },
    });
  }

  get f() {
    return this.passwordForm.controls;
  }

  toggleLogoutConfirm() {
    this.showLogoutConfirm.update((v) => !v);
  }

  logout() {
    this.authService.logout();
  }

  navigateToProfile() {
    this.router.navigate(['/profile']);
  }
}
