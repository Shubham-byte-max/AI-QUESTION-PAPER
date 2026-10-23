import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SubjectService, Subject } from '../../services/subject.service';
import { SyllabusService, Syllabus } from '../../services/syllabus.service';
import {
  ExamPatternService,
  ExamPattern,
  PatternSection,
} from '../../services/exam-pattern.service';
import { PaperService, PaperQuestion, SectionDetail } from '../../services/paper.service';

@Component({
  selector: 'app-paper-generator',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './paper-generator.component.html',
  styleUrl: './paper-generator.component.css',
})
export class PaperGeneratorComponent implements OnInit {
  authService = inject(AuthService);
  private subjectService = inject(SubjectService);
  private syllabusService = inject(SyllabusService);
  private patternService = inject(ExamPatternService);
  private paperService = inject(PaperService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // Data
  subjects = signal<Subject[]>([]);
  syllabi = signal<Syllabus[]>([]);
  patterns = signal<ExamPattern[]>([]);

  // Loading states
  loadingSubjects = signal(false);
  loadingSyllabi = signal(false);
  loadingPatterns = signal(false);
  generating = signal(false);
  saving = signal(false);

  // Form state
  currentStep = signal(1);
  totalSteps = 3;

  // Step 1: Basic config
  formTitle = signal('');
  formSubjectId = signal('');
  formSyllabusId = signal('');
  formExamPatternId = signal('');
  formTotalMarks = signal(100);
  formDuration = signal(120);

  // Step 2: Question config
  formQuestionTypes = signal<string[]>(['MCQ']);
  formNumberOfQuestions = signal(20);
  formSetCount = signal(1);

  // Step 3: Unit/topic distribution
  unitDistribution = signal<{ topic: string; count: number; type: string }[]>([]);

  formInstructions = signal('');

  formError = signal('');

  // Generated paper
  generatedPaper = signal<{
    title: string;
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    totalMarks: number;
    duration: number;
    questions: PaperQuestion[];
    actualTotalMarks: number;
    sectionDetails: SectionDetail[];
  } | null>(null);
  generationWarnings = signal<string[]>([]);

  // Paper preview state
  editingQuestionIndex = signal(-1);
  editText = signal('');
  editAnswer = signal('');
  editTopic = signal('');
  editOptions = signal<string[]>([]);
  editMarks = signal(1);
  editDifficulty = signal('Medium');

  // Saved state
  savedPaperId = signal('');
  successMessage = signal('');

  questionTypes = ['MCQ', 'Short Answer', 'Long Answer', 'True/False', 'Fill in the Blanks'];
  difficulties = ['Easy', 'Medium', 'Hard'];

  get selectedSyllabus(): Syllabus | undefined {
    return this.syllabi().find((s) => s.id === this.formSyllabusId());
  }

  get syllabusTopics(): { name: string; weightage: number }[] {
    return this.selectedSyllabus?.topics || [];
  }

  get selectedPattern(): ExamPattern | undefined {
    return this.patterns().find((p) => p.id === this.formExamPatternId());
  }

  calculatedTotalMarks = computed(() => {
    if (this.generatedPaper()) {
      return this.generatedPaper()!.actualTotalMarks;
    }
    return this.unitDistribution().reduce((sum, u) => sum + u.count, 0);
  });

  questionsByType = computed(() => {
    const questions = this.generatedPaper()?.questions || [];
    const grouped: Record<string, number> = {};
    for (const q of questions) {
      grouped[q.type] = (grouped[q.type] || 0) + 1;
    }
    return grouped;
  });

  ngOnInit() {
    this.loadSubjects();
    const patternId = this.route.snapshot.queryParamMap.get('patternId');
    this.loadPatterns(patternId || undefined);
  }

  loadSubjects() {
    this.loadingSubjects.set(true);
    this.subjectService.getSubjects().subscribe({
      next: (res) => {
        this.subjects.set(res.subjects);
        this.loadingSubjects.set(false);
      },
      error: () => {
        this.loadingSubjects.set(false);
      },
    });
  }

  loadSyllabi(subjectId: string) {
    if (!subjectId) {
      this.syllabi.set([]);
      return;
    }
    this.loadingSyllabi.set(true);
    this.syllabusService.getSyllabi(undefined, subjectId).subscribe({
      next: (res) => {
        this.syllabi.set(res.syllabi);
        this.loadingSyllabi.set(false);
      },
      error: () => {
        this.loadingSyllabi.set(false);
      },
    });
  }

  loadPatterns(preselectId?: string) {
    this.loadingPatterns.set(true);
    this.patternService.getPatterns().subscribe({
      next: (res) => {
        this.patterns.set(res.patterns);
        this.loadingPatterns.set(false);
        if (preselectId && res.patterns.some((p) => p.id === preselectId)) {
          this.onPatternChange(preselectId);
        }
      },
      error: () => {
        this.loadingPatterns.set(false);
      },
    });
  }

  onSubjectChange(subjectId: string) {
    this.formSubjectId.set(subjectId);
    this.formSyllabusId.set('');
    this.formExamPatternId.set('');
    this.loadSyllabi(subjectId);
  }

  onSyllabusChange(syllabusId: string) {
    this.formSyllabusId.set(syllabusId);
  }

  onPatternChange(patternId: string) {
    this.formExamPatternId.set(patternId);
    const pattern = this.selectedPattern;
    if (pattern) {
      this.formTotalMarks.set(pattern.totalMarks);
      this.formDuration.set(pattern.duration);
      const types = [...new Set(pattern.sections.map((s) => s.questionType))];
      this.formQuestionTypes.set(types);
      const totalQ = pattern.sections.reduce((sum, s) => sum + s.questionCount, 0);
      this.formNumberOfQuestions.set(totalQ);
    }
  }

  toggleQuestionType(type: string) {
    const current = this.formQuestionTypes();
    if (current.includes(type)) {
      if (current.length > 1) {
        this.formQuestionTypes.set(current.filter((t) => t !== type));
      }
    } else {
      this.formQuestionTypes.set([...current, type]);
    }
  }

  // Navigation
  nextStep() {
    const error = this.validateCurrentStep();
    if (error) {
      this.formError.set(error);
      return;
    }
    this.formError.set('');
    if (this.currentStep() < this.totalSteps) {
      this.currentStep.set(this.currentStep() + 1);
    }
  }

  prevStep() {
    this.formError.set('');
    if (this.currentStep() > 1) {
      this.currentStep.set(this.currentStep() - 1);
    }
  }

  goToStep(step: number) {
    if (step < this.currentStep()) {
      this.formError.set('');
      this.currentStep.set(step);
    }
  }

  validateCurrentStep(): string {
    const step = this.currentStep();
    if (step === 1) {
      if (!this.formTitle().trim()) return 'Paper title is required';
      if (this.formTitle().trim().length < 2) return 'Paper title must be at least 2 characters';
      if (!this.formSubjectId()) return 'Subject is required';
      if (this.formTotalMarks() < 1) return 'Total marks must be at least 1';
      if (this.formDuration() < 1) return 'Duration must be at least 1 minute';
    }
    if (step === 2) {
      if (this.formQuestionTypes().length === 0) return 'Select at least one question type';
      if (this.formNumberOfQuestions() < 1) return 'Number of questions must be at least 1';
      if (this.formSetCount() < 1 || this.formSetCount() > 5)
        return 'Number of sets must be between 1 and 5';
    }
    return '';
  }

  // Generate
  generatePaper() {
    const error = this.validateCurrentStep();
    if (error) {
      this.formError.set(error);
      return;
    }

    const numQ = this.formNumberOfQuestions();
    const totalM = this.formTotalMarks();
    if (numQ > totalM) {
      this.formError.set('Number of questions cannot exceed total marks');
      return;
    }

    this.formError.set('');
    this.generating.set(true);
    this.generatedPaper.set(null);
    this.generationWarnings.set([]);

    this.paperService
      .generatePaper({
        title: this.formTitle(),
        subjectId: this.formSubjectId(),
        syllabusId: this.formSyllabusId() || undefined,
        examPatternId: this.formExamPatternId() || undefined,
        totalMarks: this.formTotalMarks(),
        duration: this.formDuration(),
        questionTypes: this.formQuestionTypes(),
        numberOfQuestions: this.formNumberOfQuestions(),
        unitDistribution: this.unitDistribution(),
        instructions: this.formInstructions() || undefined,
        setCount: this.formSetCount(),
      })
      .subscribe({
        next: (res) => {
          const papers = res.papers && res.papers.length > 0 ? res.papers : [res.paper];
          this.generatedPaper.set(res.paper);
          this.generationWarnings.set(res.warnings || []);
          this.generating.set(false);
          this.currentStep.set(3);
          // Navigate to preview page with paper data (all sets)
          this.router.navigate(['/papers/preview'], {
            state: { paper: res.paper, papers, paperId: '' },
          });
        },
        error: (err) => {
          this.generating.set(false);
          this.formError.set(err.error?.message || 'Failed to generate paper. Please try again.');
        },
      });
  }

  startEditQuestion(index: number) {
    const q = this.generatedPaper()!.questions[index];
    this.editingQuestionIndex.set(index);
    this.editText.set(q.text);
    this.editAnswer.set(q.answer);
    this.editTopic.set(q.topic);
    this.editOptions.set([...q.options]);
    this.editMarks.set(q.marks);
    this.editDifficulty.set(q.difficulty);
  }

  cancelEditQuestion() {
    this.editingQuestionIndex.set(-1);
  }

  saveEditQuestion() {
    const idx = this.editingQuestionIndex();
    if (idx < 0) return;
    this.generatedPaper.update((paper) => {
      if (!paper) return paper;
      const questions = paper.questions.map((q, i) =>
        i === idx
          ? {
              ...q,
              text: this.editText(),
              answer: this.editAnswer(),
              topic: this.editTopic(),
              options: [...this.editOptions()],
              marks: this.editMarks(),
              difficulty: this.editDifficulty(),
            }
          : q,
      );
      const actualTotalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
      return { ...paper, questions, actualTotalMarks };
    });
    this.cancelEditQuestion();
  }

  deleteQuestion(index: number) {
    this.generatedPaper.update((paper) => {
      if (!paper) return paper;
      const questions = paper.questions.filter((_, i) => i !== index);
      const actualTotalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
      return { ...paper, questions, actualTotalMarks };
    });
  }

  moveQuestion(index: number, direction: -1 | 1) {
    this.generatedPaper.update((paper) => {
      if (!paper) return paper;
      const questions = [...paper.questions];
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= questions.length) return paper;
      [questions[index], questions[newIndex]] = [questions[newIndex], questions[index]];
      return { ...paper, questions };
    });
  }

  updateEditOption(index: number, value: string) {
    const opts = [...this.editOptions()];
    opts[index] = value;
    this.editOptions.set(opts);
  }

  addEditOption() {
    this.editOptions.update((opts) => [...opts, '']);
  }

  removeEditOption(index: number) {
    this.editOptions.update((opts) => opts.filter((_, i) => i !== index));
  }

  // Save paper
  savePaper() {
    const paper = this.generatedPaper();
    if (!paper) return;

    if (paper.questions.length === 0) {
      this.formError.set('Paper must contain at least one question');
      return;
    }

    this.formError.set('');
    this.saving.set(true);

    this.paperService
      .savePaper({
        title: paper.title,
        subjectId: paper.subjectId,
        questions: paper.questions,
        totalMarks: paper.totalMarks,
        duration: paper.duration,
        examPattern: this.formExamPatternId() || undefined,
        syllabus: this.formSyllabusId() || undefined,
        instructions: this.formInstructions() || undefined,
      })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          this.savedPaperId.set(res.paper.id);
          this.successMessage.set('Paper saved successfully!');
          setTimeout(() => this.successMessage.set(''), 5000);
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(err.error?.message || 'Failed to save paper. Please try again.');
        },
      });
  }

  // Reset
  resetForm() {
    this.currentStep.set(1);
    this.formTitle.set('');
    this.formSubjectId.set('');
    this.formSyllabusId.set('');
    this.formExamPatternId.set('');
    this.formTotalMarks.set(100);
    this.formDuration.set(120);
    this.formQuestionTypes.set(['MCQ']);
    this.formNumberOfQuestions.set(20);
    this.formSetCount.set(1);
    this.unitDistribution.set([]);
    this.formInstructions.set('');
    this.generatedPaper.set(null);
    this.generationWarnings.set([]);
    this.savedPaperId.set('');
    this.successMessage.set('');
    this.formError.set('');
  }

  logout() {
    this.authService.logout();
  }
}
