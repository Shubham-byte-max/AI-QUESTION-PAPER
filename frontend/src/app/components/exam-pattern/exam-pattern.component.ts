import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SubjectService, Subject } from '../../services/subject.service';
import {
  ExamPatternService,
  ExamPattern,
  PatternSection,
} from '../../services/exam-pattern.service';

@Component({
  selector: 'app-exam-pattern',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './exam-pattern.component.html',
  styleUrl: './exam-pattern.component.css',
})
export class ExamPatternComponent implements OnInit {
  authService = inject(AuthService);
  private patternService = inject(ExamPatternService);
  private subjectService = inject(SubjectService);
  private router = inject(Router);

  patterns = signal<ExamPattern[]>([]);
  subjects = signal<Subject[]>([]);
  loading = signal(true);
  error = signal('');
  successMessage = signal('');
  searchQuery = signal('');
  searchTimeout: ReturnType<typeof setTimeout> | null = null;

  showModal = signal(false);
  editingPattern = signal<ExamPattern | null>(null);
  formPatternName = signal('');
  formDuration = signal(120);
  formSubjectId = signal('');
  formSections = signal<PatternSection[]>([]);
  formError = signal('');
  formSubmitting = signal(false);

  showDeleteConfirm = signal(false);
  deletingPattern = signal<ExamPattern | null>(null);
  deleting = signal(false);

  showUseModal = signal(false);
  usingPattern = signal<ExamPattern | null>(null);

  questionTypes = ['MCQ', 'Short Answer', 'Long Answer', 'True/False', 'Fill in the Blanks'];
  difficulties = ['Easy', 'Medium', 'Hard', 'Mixed'];

  getAttemptQuestions(section: PatternSection): number {
    const count = section.questionCount || 0;
    const attempt = section.attemptQuestions ?? count;
    if (!Number.isFinite(attempt) || attempt < 1) return count;
    return Math.min(Math.floor(attempt), count);
  }

  updateAttempt(index: number, raw: string) {
    const n = parseInt(raw, 10);
    const value = !isNaN(n) && n >= 1 ? n : undefined;
    this.formSections.update((sections) =>
      sections.map((s, i) => (i === index ? { ...s, attemptQuestions: value } : s)),
    );
  }

  calculatedTotalMarks = computed(() =>
    this.formSections().reduce(
      (sum, s) => sum + this.getAttemptQuestions(s) * s.marksPerQuestion,
      0,
    ),
  );

  totalQuestionCount = computed(() =>
    this.formSections().reduce((sum, s) => sum + s.questionCount, 0),
  );

  ngOnInit() {
    this.loadPatterns();
    this.loadSubjects();
  }

  loadSubjects() {
    this.subjectService.getSubjects().subscribe({
      next: (res) => this.subjects.set(res.subjects),
      error: () => {},
    });
  }

  loadPatterns() {
    this.loading.set(true);
    this.error.set('');
    const search = this.searchQuery() || undefined;
    this.patternService.getPatterns(search).subscribe({
      next: (res) => {
        this.patterns.set(res.patterns);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load patterns.');
        this.loading.set(false);
      },
    });
  }

  onSearchInput(value: string) {
    this.searchQuery.set(value);
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.loadPatterns(), 300);
  }

  clearSearch() {
    this.searchQuery.set('');
    this.loadPatterns();
  }

  openAddModal() {
    this.editingPattern.set(null);
    this.formPatternName.set('');
    this.formDuration.set(120);
    this.formSubjectId.set('');
    this.formSections.set([this.createEmptySection('Section A')]);
    this.formError.set('');
    this.showModal.set(true);
  }

  openEditModal(pattern: ExamPattern) {
    this.editingPattern.set(pattern);
    this.formPatternName.set(pattern.patternName);
    this.formDuration.set(pattern.duration);
    this.formSubjectId.set(pattern.subjectId || '');
    this.formSections.set(
      pattern.sections.map((s) => ({
        name: s.name,
        questionType: s.questionType,
        questionCount: s.questionCount,
        attemptQuestions: s.attemptQuestions ?? s.questionCount,
        marksPerQuestion: s.marksPerQuestion,
        difficulty: s.difficulty,
        instruction: s.instruction || '',
      })),
    );
    this.formError.set('');
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingPattern.set(null);
    this.formError.set('');
  }

  createEmptySection(name?: string): PatternSection {
    return {
      name: name || '',
      questionType: 'MCQ',
      questionCount: 5,
      marksPerQuestion: 1,
      difficulty: 'Medium',
      instruction: '',
    };
  }

  addSection() {
    const idx = this.formSections().length;
    const letter = String.fromCharCode(65 + idx);
    this.formSections.update((sections) => [
      ...sections,
      this.createEmptySection(`Section ${letter}`),
    ]);
  }

  removeSection(index: number) {
    if (this.formSections().length <= 1) {
      this.formError.set('At least one section is required');
      return;
    }
    this.formSections.update((sections) => sections.filter((_, i) => i !== index));
  }

  updateSection(index: number, field: keyof PatternSection, value: string | number) {
    this.formSections.update((sections) =>
      sections.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
  }

  getSectionMarks(section: PatternSection): number {
    return this.getAttemptQuestions(section) * section.marksPerQuestion;
  }

  submitForm() {
    const name = this.formPatternName().trim();
    const duration = this.formDuration();
    const sections = this.formSections();

    if (!name) {
      this.formError.set('Pattern name is required');
      return;
    }
    if (name.length < 2) {
      this.formError.set('Pattern name must be at least 2 characters');
      return;
    }
    if (!duration || duration < 1) {
      this.formError.set('Duration must be at least 1 minute');
      return;
    }
    if (sections.length === 0) {
      this.formError.set('At least one section is required');
      return;
    }

    for (const s of sections) {
      if (!s.name.trim()) {
        this.formError.set('All sections must have a name');
        return;
      }
      if (s.questionCount < 1) {
        this.formError.set(`Section "${s.name}" must have at least 1 question`);
        return;
      }
      if (s.marksPerQuestion < 1) {
        this.formError.set(`Section "${s.name}" must have at least 1 mark per question`);
        return;
      }
      if (
        s.attemptQuestions != null &&
        Number.isFinite(s.attemptQuestions) &&
        s.attemptQuestions >= 1 &&
        s.attemptQuestions > s.questionCount
      ) {
        this.formError.set(
          `Section "${s.name}": attempt questions cannot exceed the question count`,
        );
        return;
      }
    }

    this.formError.set('');
    this.formSubmitting.set(true);

    const totalMarks = this.calculatedTotalMarks();
    const payload = {
      patternName: name,
      totalMarks,
      duration,
      subjectId: this.formSubjectId() || null,
      sections: sections.map((s) => {
        const attempt = this.getAttemptQuestions(s);

        const instruction =
          (s.instruction || '').trim() ||
          (attempt < s.questionCount
            ? `Attempt any ${attempt} out of ${s.questionCount} questions. Each question carries ${s.marksPerQuestion} marks.`
            : '');
        return {
          name: s.name.trim(),
          questionType: s.questionType,
          questionCount: s.questionCount,
          attemptQuestions: attempt,
          marksPerQuestion: s.marksPerQuestion,
          difficulty: s.difficulty,
          instruction,
        };
      }),
    };

    const editing = this.editingPattern();
    const request$ = editing
      ? this.patternService.updatePattern(editing.id, payload)
      : this.patternService.createPattern(payload);

    request$.subscribe({
      next: () => {
        this.formSubmitting.set(false);
        this.closeModal();
        this.showToast(editing ? 'Pattern updated successfully' : 'Pattern created successfully');
        this.loadPatterns();
      },
      error: (err) => {
        this.formSubmitting.set(false);
        this.formError.set(err.error?.message || 'Something went wrong. Please try again.');
      },
    });
  }

  confirmDelete(pattern: ExamPattern) {
    this.deletingPattern.set(pattern);
    this.showDeleteConfirm.set(true);
  }

  cancelDelete() {
    this.showDeleteConfirm.set(false);
    this.deletingPattern.set(null);
  }

  deletePattern() {
    const pattern = this.deletingPattern();
    if (!pattern) return;

    this.deleting.set(true);
    this.patternService.deletePattern(pattern.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.showDeleteConfirm.set(false);
        this.deletingPattern.set(null);
        this.showToast('Pattern deleted successfully');
        this.loadPatterns();
      },
      error: (err) => {
        this.deleting.set(false);
        this.showToast(err.error?.message || 'Failed to delete pattern', 'error');
      },
    });
  }

  openUseModal(pattern: ExamPattern) {
    this.usingPattern.set(pattern);
    this.showUseModal.set(true);
  }

  closeUseModal() {
    this.showUseModal.set(false);
    this.usingPattern.set(null);
  }

  usePattern() {
    const pattern = this.usingPattern();
    if (!pattern) return;
    this.closeUseModal();

    this.router.navigate(['/papers'], { queryParams: { patternId: pattern.id } });
  }

  showToast(message: string, type: 'success' | 'error' = 'success') {
    this.successMessage.set(type === 'error' ? '' : message);
    this.error.set(type === 'error' ? message : this.error());
    setTimeout(() => {
      this.successMessage.set('');
      if (type === 'error') this.error.set('');
    }, 3000);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  logout() {
    this.authService.logout();
  }
}
