import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService, User } from '../../services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent implements OnInit {
  authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private router = inject(Router);

  loading = signal(true);
  error = signal('');
  successMessage = signal('');
  errorMessage = signal('');
  isSubmitting = signal(false);
  isEditing = signal(false);
  profileData = signal<User | null>(null);

  profileForm: FormGroup;

  constructor() {
    this.profileForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      collegeName: [''],
    });
  }

  ngOnInit() {
    this.loadProfile();
  }

  loadProfile() {
    this.loading.set(true);
    this.error.set('');

    this.authService.getProfile().subscribe({
      next: (res) => {
        this.profileData.set(res.user);
        this.profileForm.patchValue({
          name: res.user.name,
          email: res.user.email,
          collegeName: res.user.collegeName || '',
        });
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load profile. Please try again.');
        this.loading.set(false);
      },
    });
  }

  startEditing() {
    this.isEditing.set(true);
    this.successMessage.set('');
    this.errorMessage.set('');
    const user = this.profileData();
    if (user) {
      this.profileForm.patchValue({
        name: user.name,
        email: user.email,
        collegeName: user.collegeName || '',
      });
    }
  }

  cancelEditing() {
    this.isEditing.set(false);
    this.errorMessage.set('');
    this.successMessage.set('');
    const user = this.profileData();
    if (user) {
      this.profileForm.patchValue({
        name: user.name,
        email: user.email,
        collegeName: user.collegeName || '',
      });
    }
  }

  saveProfile() {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');
    this.isSubmitting.set(true);

    const { name, email, collegeName } = this.profileForm.value;

    this.authService.updateProfile({ name, email, collegeName: collegeName || '' }).subscribe({
      next: (res) => {
        this.profileData.set(res.user);
        this.isEditing.set(false);
        this.isSubmitting.set(false);
        this.successMessage.set('Profile updated successfully.');
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to update profile. Please try again.');
      },
    });
  }

  get f() {
    return this.profileForm.controls;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  logout() {
    this.authService.logout();
  }

  navigateToSettings() {
    this.router.navigate(['/settings']);
  }
}
