import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SubjectService, Subject } from '../../services/subject.service';
import { SyllabusService, Syllabus } from '../../services/syllabus.service';

@Component({
  selector: 'app-syllabus',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './syllabus.component.html',
  styleUrl: './syllabus.component.css',
})
export class SyllabusComponent implements OnInit {
  authService = inject(AuthService);
  private syllabusService = inject(SyllabusService);
  private subjectService = inject(SubjectService);
  private router = inject(Router);

  syllabi = signal<Syllabus[]>([]);
  subjects = signal<Subject[]>([]);
  loading = signal(true);
  error = signal('');
  searchQuery = signal('');
  searchTimeout: ReturnType<typeof setTimeout> | null = null;
  filterSubjectId = signal('');

  showModal = signal(false);
  editingSyllabus = signal<Syllabus | null>(null);
  formTitle = signal('');
  formSubjectId = signal('');
  formContent = signal('');
  formTopics = signal<{ name: string; weightage: number }[]>([]);
  formError = signal('');
  formSubmitting = signal(false);
  isUploadMode = signal(false);
  selectedFile = signal<File | null>(null);
  dragOver = signal(false);

  showDeleteConfirm = signal(false);
  deletingSyllabus = signal<Syllabus | null>(null);
  deleting = signal(false);

  showViewModal = signal(false);
  viewingSyllabus = signal<Syllabus | null>(null);

  toastMessage = signal('');
  toastType = signal<'success' | 'error'>('success');
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    this.loadSubjects();
    this.loadSyllabi();
  }

  loadSubjects() {
    this.subjectService.getSubjects().subscribe({
      next: (res) => {
        this.subjects.set(res.subjects);
      },
      error: () => {},
    });
  }

  loadSyllabi() {
    this.loading.set(true);
    this.error.set('');
    this.syllabusService.getSyllabi(this.searchQuery(), this.filterSubjectId()).subscribe({
      next: (res) => {
        this.syllabi.set(res.syllabi);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load syllabi. Please try again.');
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
      this.loadSyllabi();
    }, 300);
  }

  onSubjectFilter(value: string) {
    this.filterSubjectId.set(value);
    this.loadSyllabi();
  }

  clearSearch() {
    this.searchQuery.set('');
    this.loadSyllabi();
  }

  openAddModal() {
    this.editingSyllabus.set(null);
    this.formTitle.set('');
    this.formSubjectId.set('');
    this.formContent.set('');
    this.formTopics.set([]);
    this.formError.set('');
    this.isUploadMode.set(false);
    this.selectedFile.set(null);
    this.showModal.set(true);
  }

  openEditModal(syllabus: Syllabus) {
    this.editingSyllabus.set(syllabus);
    this.formTitle.set(syllabus.title);
    this.formSubjectId.set(syllabus.subjectId);
    this.formContent.set(syllabus.content);
    this.formTopics.set([...syllabus.topics.map((t) => ({ ...t }))]);
    this.formError.set('');
    this.isUploadMode.set(false);
    this.selectedFile.set(null);
    this.showModal.set(true);
  }

  openViewModal(syllabus: Syllabus) {
    this.viewingSyllabus.set(syllabus);
    this.showViewModal.set(true);
  }

  closeViewModal() {
    this.showViewModal.set(false);
    this.viewingSyllabus.set(null);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingSyllabus.set(null);
    this.formError.set('');
    this.isUploadMode.set(false);
    this.selectedFile.set(null);
  }

  toggleUploadMode() {
    this.isUploadMode.set(!this.isUploadMode());
    this.selectedFile.set(null);
    this.formError.set('');
  }

  private readonly ALLOWED_FILE_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
  ];
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024;

  onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (!this.ALLOWED_FILE_TYPES.includes(file.type)) {
        this.formError.set('Unsupported file type. Please upload PDF, DOCX, or TXT.');
        input.value = '';
        return;
      }
      if (file.size > this.MAX_FILE_SIZE) {
        this.formError.set('File is too large. Maximum size is 10MB.');
        input.value = '';
        return;
      }
      this.formError.set('');
      this.selectedFile.set(file);
    }
  }

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    this.dragOver.set(false);
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      if (!this.ALLOWED_FILE_TYPES.includes(file.type)) {
        this.formError.set('Unsupported file type. Please upload PDF, DOCX, or TXT.');
        return;
      }
      if (file.size > this.MAX_FILE_SIZE) {
        this.formError.set('File is too large. Maximum size is 10MB.');
        return;
      }
      this.formError.set('');
      this.selectedFile.set(file);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDragLeave() {
    this.dragOver.set(false);
  }

  removeFile() {
    this.selectedFile.set(null);
  }

  addTopic() {
    this.formTopics.update((topics) => [...topics, { name: '', weightage: 0 }]);
  }

  removeTopic(index: number) {
    this.formTopics.update((topics) => topics.filter((_, i) => i !== index));
  }

  updateTopicName(index: number, value: string) {
    this.formTopics.update((topics) =>
      topics.map((t, i) => (i === index ? { ...t, name: value } : t)),
    );
  }

  updateTopicWeightage(index: number, value: number) {
    this.formTopics.update((topics) =>
      topics.map((t, i) => (i === index ? { ...t, weightage: value } : t)),
    );
  }

  submitForm() {
    const title = this.formTitle().trim();
    const subjectId = this.formSubjectId();

    if (!title || !subjectId) {
      this.formError.set('Title and subject are required');
      return;
    }

    if (title.length < 2) {
      this.formError.set('Syllabus title must be at least 2 characters');
      return;
    }

    if (this.isUploadMode() && this.selectedFile()) {
      this.submitUpload();
      return;
    }

    if (!this.isUploadMode()) {
      const content = this.formContent().trim();
      if (!content) {
        this.formError.set('Syllabus content cannot be empty');
        return;
      }
    }

    this.formError.set('');
    this.formSubmitting.set(true);

    const payload = {
      title,
      subjectId,
      topics: this.formTopics(),
      content: this.formContent(),
    };
    const editing = this.editingSyllabus();

    const request$ = editing
      ? this.syllabusService.updateSyllabus(editing.id, payload)
      : this.syllabusService.createSyllabus(payload);

    request$.subscribe({
      next: () => {
        this.formSubmitting.set(false);
        this.closeModal();
        this.showToast(
          editing ? 'Syllabus updated successfully' : 'Syllabus created successfully',
          'success',
        );
        this.loadSyllabi();
      },
      error: (err) => {
        this.formSubmitting.set(false);
        this.formError.set(err.error?.message || 'Something went wrong. Please try again.');
      },
    });
  }

  submitUpload() {
    const title = this.formTitle().trim();
    const subjectId = this.formSubjectId();
    const file = this.selectedFile();

    if (!file) {
      this.formError.set('Please select a file to upload');
      return;
    }

    if (!this.ALLOWED_FILE_TYPES.includes(file.type)) {
      this.formError.set('Unsupported file type. Please upload PDF, DOCX, or TXT.');
      return;
    }

    if (file.size > this.MAX_FILE_SIZE) {
      this.formError.set('File is too large. Maximum size is 10MB.');
      return;
    }

    this.formError.set('');
    this.formSubmitting.set(true);

    this.syllabusService.uploadSyllabus(title, subjectId, file).subscribe({
      next: () => {
        this.formSubmitting.set(false);
        this.closeModal();
        this.showToast('Syllabus uploaded successfully', 'success');
        this.loadSyllabi();
      },
      error: (err) => {
        this.formSubmitting.set(false);
        this.formError.set(err.error?.message || 'Upload failed. Please try again.');
      },
    });
  }

  confirmDelete(syllabus: Syllabus) {
    this.deletingSyllabus.set(syllabus);
    this.showDeleteConfirm.set(true);
  }

  cancelDelete() {
    this.showDeleteConfirm.set(false);
    this.deletingSyllabus.set(null);
  }

  deleteSyllabus() {
    const syllabus = this.deletingSyllabus();
    if (!syllabus) return;

    this.deleting.set(true);
    this.syllabusService.deleteSyllabus(syllabus.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.showDeleteConfirm.set(false);
        this.deletingSyllabus.set(null);
        this.showToast('Syllabus deleted successfully', 'success');
        this.loadSyllabi();
      },
      error: (err) => {
        this.deleting.set(false);
        this.showToast(err.error?.message || 'Failed to delete syllabus', 'error');
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

  truncateText(text: string, maxLen: number): string {
    if (!text) return '';
    return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
  }

  logout() {
    this.authService.logout();
  }
}
