import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { QuestionService, Question } from '../../services/question.service';
import { SubjectService, Subject } from '../../services/subject.service';
import { PaperService, Paper } from '../../services/paper.service';

@Component({
  selector: 'app-questions',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './questions.component.html',
  styleUrl: './questions.component.css',
})
export class QuestionsComponent implements OnInit {
  authService = inject(AuthService);
  private questionService = inject(QuestionService);
  private subjectService = inject(SubjectService);
  private paperService = inject(PaperService);
  private router = inject(Router);

  questions = signal<Question[]>([]);
  subjects = signal<Subject[]>([]);
  papers = signal<Paper[]>([]);
  expandedPaperIds = signal<string[]>([]);
  loading = signal(true);
  error = signal('');
  searchQuery = signal('');
  searchTimeout: ReturnType<typeof setTimeout> | null = null;

  filterSubject = signal('');
  filterDifficulty = signal('');
  filterType = signal('');
  filterTopic = signal('');
  filterTopicTimeout: ReturnType<typeof setTimeout> | null = null;

  showModal = signal(false);
  editingQuestion = signal<Question | null>(null);
  formText = signal('');
  formType = signal('MCQ');
  formDifficulty = signal('Medium');
  formOptions = signal<string[]>(['', '', '', '']);
  formAnswer = signal('');
  formMarks = signal<number>(1);
  formTopic = signal('');
  formSource = signal('');
  formSubjectId = signal('');
  formError = signal('');
  formSubmitting = signal(false);

  showDeleteConfirm = signal(false);
  deletingQuestion = signal<Question | null>(null);
  deleting = signal(false);

  viewingQuestion = signal<Question | null>(null);

  toastMessage = signal('');
  toastType = signal<'success' | 'error'>('success');
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  questionTypes = ['MCQ', 'Short Answer', 'Long Answer', 'True/False', 'Fill in the Blanks'];
  difficulties = ['Easy', 'Medium', 'Hard'];

  isMcq = computed(() => this.formType() === 'MCQ');
  isTrueFalse = computed(() => this.formType() === 'True/False');

  mcqAnswerOptions = computed(() =>
    this.formOptions()
      .map((o) => o.trim())
      .filter((o) => o.length > 0),
  );

  typeCounts = computed(() => {
    const grouped: Record<string, number> = {};
    for (const q of this.questions()) {
      grouped[q.type] = (grouped[q.type] || 0) + 1;
    }
    return grouped;
  });

  onFormTypeChange(value: string) {
    this.formType.set(value);
    if (value === 'True/False') {
      const current = this.formAnswer().trim().toLowerCase();
      if (current !== 'true' && current !== 'false') {
        this.formAnswer.set('');
      }
    }
  }

  openViewModal(question: Question) {
    this.viewingQuestion.set(question);
  }

  closeViewModal() {
    this.viewingQuestion.set(null);
  }

  isCorrectOption(question: Question, option: string): boolean {
    return (
      !!question.answer && option.trim().toLowerCase() === question.answer.trim().toLowerCase()
    );
  }

  ngOnInit() {
    this.loadSubjects();
    this.loadQuestions();
    this.loadPapers();
  }

  loadPapers() {
    this.paperService.getPapers().subscribe({
      next: (res) => {
        this.papers.set(res.papers || []);
      },
      error: () => {},
    });
  }

  groupedPapers = computed(() => {
    const bank = this.questions();
    return this.papers().map((p) => ({
      paper: p,
      questions: bank.filter((q) => q.paperId != null && String(q.paperId) === String(p.id)),
    }));
  });

  visibleGroups = computed(() => {
    const groups = this.groupedPapers();
    if (this.hasActiveFilters()) {
      return groups.filter((g) => g.questions.length > 0);
    }
    return groups;
  });

  legacyQuestions = computed(() =>
    this.questions().filter(
      (q) => q.paperId == null || !this.papers().some((p) => String(p.id) === String(q.paperId)),
    ),
  );

  isPaperExpanded(id: string): boolean {
    if (this.hasActiveFilters()) return true;
    return this.expandedPaperIds().includes(id);
  }

  togglePaper(id: string) {
    const current = this.expandedPaperIds();
    this.expandedPaperIds.set(
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  openPaper(paperId: string) {
    this.router.navigate(['/papers', paperId]);
  }

  paperTypeSummary(paper: Paper): string {
    const types = [...new Set((paper.questions || []).map((q) => q.type))];
    return types.length > 0 ? types.join(', ') : '-';
  }

  loadSubjects() {
    this.subjectService.getSubjects().subscribe({
      next: (res) => {
        this.subjects.set(res.subjects);
      },
      error: () => {},
    });
  }

  loadQuestions() {
    this.loading.set(true);
    this.error.set('');
    const filters: any = {};
    if (this.searchQuery()) filters.search = this.searchQuery();
    if (this.filterSubject()) filters.subjectId = this.filterSubject();
    if (this.filterDifficulty()) filters.difficulty = this.filterDifficulty();
    if (this.filterType()) filters.type = this.filterType();
    if (this.filterTopic()) filters.topic = this.filterTopic();

    this.questionService.getQuestions(filters).subscribe({
      next: (res) => {
        this.questions.set(res.questions);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load questions. Please try again.');
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
      this.loadQuestions();
    }, 300);
  }

  clearSearch() {
    this.searchQuery.set('');
    this.loadQuestions();
  }

  onFilterChange() {
    this.loadQuestions();
  }

  onTopicFilterInput(value: string) {
    this.filterTopic.set(value);
    if (this.filterTopicTimeout) {
      clearTimeout(this.filterTopicTimeout);
    }
    this.filterTopicTimeout = setTimeout(() => {
      this.loadQuestions();
    }, 400);
  }

  clearFilters() {
    this.filterSubject.set('');
    this.filterDifficulty.set('');
    this.filterType.set('');
    this.filterTopic.set('');
    this.searchQuery.set('');
    this.loadQuestions();
  }

  hasActiveFilters(): boolean {
    return !!(
      this.filterSubject() ||
      this.filterDifficulty() ||
      this.filterType() ||
      this.filterTopic() ||
      this.searchQuery()
    );
  }

  openAddModal() {
    this.editingQuestion.set(null);
    this.formText.set('');
    this.formType.set('MCQ');
    this.formDifficulty.set('Medium');
    this.formOptions.set(['', '', '', '']);
    this.formAnswer.set('');
    this.formMarks.set(1);
    this.formTopic.set('');
    this.formSource.set('');
    this.formSubjectId.set(this.subjects().length > 0 ? this.subjects()[0].id : '');
    this.formError.set('');
    this.showModal.set(true);
  }

  openEditModal(question: Question) {
    this.editingQuestion.set(question);
    this.formText.set(question.text);
    this.formType.set(question.type);
    this.formDifficulty.set(question.difficulty);
    this.formOptions.set(
      question.options.length > 0
        ? [...question.options, '', '', '', ''].slice(0, Math.max(question.options.length, 4))
        : ['', '', '', ''],
    );
    this.formAnswer.set(question.answer);
    this.formMarks.set(question.marks);
    this.formTopic.set(question.topic);
    this.formSource.set(question.source);
    this.formSubjectId.set(question.subjectId ?? '');
    this.formError.set('');
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingQuestion.set(null);
    this.formError.set('');
  }

  addOption() {
    const current = this.formOptions();
    if (current.length < 8) {
      this.formOptions.set([...current, '']);
    }
  }

  removeOption(index: number) {
    const current = this.formOptions();
    if (current.length > 2) {
      const updated = current.filter((_, i) => i !== index);
      this.formOptions.set(updated);
    }
  }

  updateOption(index: number, value: string) {
    const current = [...this.formOptions()];
    current[index] = value;
    this.formOptions.set(current);
  }

  submitForm() {
    const text = this.formText().trim();
    const type = this.formType();
    const difficulty = this.formDifficulty();
    const marks = this.formMarks();
    const subjectId = this.formSubjectId();
    const answer = this.formAnswer().trim();
    const topic = this.formTopic().trim();
    const source = this.formSource().trim();

    if (!text) {
      this.formError.set('Question text is required');
      return;
    }

    if (text.length < 5) {
      this.formError.set('Question text must be at least 5 characters');
      return;
    }

    if (!subjectId) {
      this.formError.set('Please select a subject');
      return;
    }

    if (marks < 1) {
      this.formError.set('Marks must be at least 1');
      return;
    }

    let options: string[] = [];
    if (type === 'MCQ') {
      options = this.formOptions()
        .map((o) => o.trim())
        .filter((o) => o.length > 0);
      if (options.length < 2) {
        this.formError.set('MCQ questions must have at least 2 options');
        return;
      }
      if (!answer) {
        this.formError.set('Please select the correct answer for this MCQ');
        return;
      }
      const matches = options.some((o) => o.toLowerCase() === answer.toLowerCase());
      if (!matches) {
        this.formError.set('The correct answer must match one of the MCQ options');
        return;
      }
    }

    if (type === 'True/False' && answer) {
      const normalized = answer.toLowerCase();
      if (normalized !== 'true' && normalized !== 'false') {
        this.formError.set('True/False answer must be either True or False');
        return;
      }
    }

    this.formError.set('');
    this.formSubmitting.set(true);

    const payload = {
      text,
      type,
      difficulty,
      options,
      answer,
      marks,
      topic,
      source,
      subjectId,
    };

    const editing = this.editingQuestion();

    const request$ = editing
      ? this.questionService.updateQuestion(editing.id, payload)
      : this.questionService.createQuestion(payload);

    request$.subscribe({
      next: () => {
        this.formSubmitting.set(false);
        this.closeModal();
        this.showToast(
          editing ? 'Question updated successfully' : 'Question created successfully',
          'success',
        );
        this.loadQuestions();
        this.loadPapers();
      },
      error: (err) => {
        this.formSubmitting.set(false);
        this.formError.set(err.error?.message || 'Something went wrong. Please try again.');
      },
    });
  }

  confirmDelete(question: Question) {
    this.deletingQuestion.set(question);
    this.showDeleteConfirm.set(true);
  }

  cancelDelete() {
    this.showDeleteConfirm.set(false);
    this.deletingQuestion.set(null);
  }

  deleteQuestion() {
    const question = this.deletingQuestion();
    if (!question) return;

    this.deleting.set(true);
    this.questionService.deleteQuestion(question.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.showDeleteConfirm.set(false);
        this.deletingQuestion.set(null);
        this.showToast('Question deleted successfully', 'success');
        this.loadQuestions();
        this.loadPapers();
      },
      error: (err) => {
        this.deleting.set(false);
        this.showToast(err.error?.message || 'Failed to delete question', 'error');
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
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '...';
  }

  logout() {
    this.authService.logout();
  }
}
