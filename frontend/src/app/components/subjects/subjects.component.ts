import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SubjectService, Subject } from '../../services/subject.service';

@Component({
  selector: 'app-subjects',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './subjects.component.html',
  styleUrl: './subjects.component.css',
})
export class SubjectsComponent implements OnInit {
  authService = inject(AuthService);
  private subjectService = inject(SubjectService);
  private router = inject(Router);

  subjects = signal<Subject[]>([]);
  loading = signal(true);
  error = signal('');
  searchQuery = signal('');
  searchTimeout: ReturnType<typeof setTimeout> | null = null;

  showModal = signal(false);
  editingSubject = signal<Subject | null>(null);
  formName = signal('');
  formCode = signal('');
  formDescription = signal('');
  formSemester = signal<number>(1);
  formBoard = signal('');
  formClassLevel = signal('');
  formError = signal('');
  formSubmitting = signal(false);

  showDeleteConfirm = signal(false);
  deletingSubject = signal<Subject | null>(null);
  deleting = signal(false);

  toastMessage = signal('');
  toastType = signal<'success' | 'error'>('success');
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    this.loadSubjects();
  }

  loadSubjects() {
    this.loading.set(true);
    this.error.set('');
    this.subjectService.getSubjects().subscribe({
      next: (res) => {
        this.subjects.set(res.subjects);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load subjects. Please try again.');
        this.loading.set(false);
      },
    });
  }

  onSearchInput(value: string) {
    this.searchQuery.set(value);
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(() => {
      this.performSearch();
    }, 300);
  }

  performSearch() {
    const query = this.searchQuery();
    this.loading.set(true);
    this.error.set('');
    this.subjectService.getSubjects(query).subscribe({
      next: (res) => {
        this.subjects.set(res.subjects);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Search failed. Please try again.');
        this.loading.set(false);
      },
    });
  }

  clearSearch() {
    this.searchQuery.set('');
    this.performSearch();
  }

  openAddModal() {
    this.editingSubject.set(null);
    this.formName.set('');
    this.formCode.set('');
    this.formDescription.set('');
    this.formSemester.set(1);
    this.formBoard.set('');
    this.formClassLevel.set('');
    this.formError.set('');
    this.showModal.set(true);
  }

  openEditModal(subject: Subject) {
    this.editingSubject.set(subject);
    this.formName.set(subject.name);
    this.formCode.set(subject.code);
    this.formDescription.set(subject.description);
    this.formSemester.set(subject.semester);
    this.formBoard.set(subject.board || '');
    this.formClassLevel.set(subject.classLevel || '');
    this.formError.set('');
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingSubject.set(null);
    this.formError.set('');
  }

  submitForm() {
    const name = this.formName().trim();
    const code = this.formCode().trim();
    const description = this.formDescription().trim();
    const semester = this.formSemester();

    if (!name || !code) {
      this.formError.set('Subject name and code are required');
      return;
    }

    if (name.length < 2) {
      this.formError.set('Subject name must be at least 2 characters');
      return;
    }

    if (code.length < 2) {
      this.formError.set('Subject code must be at least 2 characters');
      return;
    }

    if (semester < 1 || semester > 8) {
      this.formError.set('Semester must be between 1 and 8');
      return;
    }

    this.formError.set('');
    this.formSubmitting.set(true);

    const payload = {
      name,
      code,
      description,
      semester,
      board: this.formBoard().trim(),
      classLevel: this.formClassLevel().trim(),
    };
    const editing = this.editingSubject();

    const request$ = editing
      ? this.subjectService.updateSubject(editing.id, payload)
      : this.subjectService.createSubject(payload);

    request$.subscribe({
      next: (res) => {
        this.formSubmitting.set(false);
        this.closeModal();
        this.showToast(
          editing ? 'Subject updated successfully' : 'Subject created successfully',
          'success',
        );
        this.loadSubjects();
      },
      error: (err) => {
        this.formSubmitting.set(false);
        this.formError.set(err.error?.message || 'Something went wrong. Please try again.');
      },
    });
  }

  confirmDelete(subject: Subject) {
    this.deletingSubject.set(subject);
    this.showDeleteConfirm.set(true);
  }

  cancelDelete() {
    this.showDeleteConfirm.set(false);
    this.deletingSubject.set(null);
  }

  deleteSubject() {
    const subject = this.deletingSubject();
    if (!subject) return;

    this.deleting.set(true);
    this.subjectService.deleteSubject(subject.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.showDeleteConfirm.set(false);
        this.deletingSubject.set(null);
        this.showToast('Subject deleted successfully', 'success');
        this.loadSubjects();
      },
      error: (err) => {
        this.deleting.set(false);
        this.showToast(err.error?.message || 'Failed to delete subject', 'error');
      },
    });
  }

  showToast(message: string, type: 'success' | 'error') {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.toastMessage.set(message);
    this.toastType.set(type);
    this.toastTimeout = setTimeout(() => {
      this.toastMessage.set('');
    }, 3000);
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  logout() {
    this.authService.logout();
  }
}
