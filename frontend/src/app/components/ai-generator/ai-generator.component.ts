import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SubjectService, Subject } from '../../services/subject.service';
import { SyllabusService, Syllabus } from '../../services/syllabus.service';
import {
  AiGeneratorService,
  GeneratedQuestion,
  GeneratedPaperSet,
} from '../../services/ai-generator.service';
import { PaperService } from '../../services/paper.service';

export interface PaperSetView extends GeneratedPaperSet {
  selected: boolean;
  previewOpen: boolean;
}

@Component({
  selector: 'app-ai-generator',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './ai-generator.component.html',
  styleUrl: './ai-generator.component.css',
})
export class AiGeneratorComponent implements OnInit {
  authService = inject(AuthService);
  private subjectService = inject(SubjectService);
  private syllabusService = inject(SyllabusService);
  private aiService = inject(AiGeneratorService);
  private paperService = inject(PaperService);
  private router = inject(Router);

  subjects = signal<Subject[]>([]);
  syllabi = signal<Syllabus[]>([]);
  generatedQuestions = signal<GeneratedQuestion[]>([]);
  generatedSets = signal<PaperSetView[]>([]);

  loadingSubjects = signal(false);
  loadingSyllabi = signal(false);
  generating = signal(false);
  saving = signal(false);
  savingSets = signal(false);

  error = signal('');
  successMessage = signal('');
  generationWarnings = signal<string[]>([]);

  formSubjectId = signal('');
  formSyllabusId = signal('');
  formTopic = signal('');
  formCount = signal(5);
  formDifficulty = signal('Medium');
  formType = signal('MCQ');
  formMarks = signal(2);
  formInstructions = signal('');
  formSetCount = signal(1);

  editingIndex = signal(-1);
  editText = signal('');
  editAnswer = signal('');
  editTopic = signal('');
  editOptions = signal<string[]>([]);

  questionTypes = ['MCQ', 'Short Answer', 'Long Answer', 'True/False', 'Fill in the Blanks'];
  difficulties = ['Easy', 'Medium', 'Hard'];

  selectedCount = computed(() => this.generatedQuestions().filter((q) => q.selected).length);
  selectedSetsCount = computed(() => this.generatedSets().filter((s) => s.selected).length);
  totalSetQuestionsCount = computed(() =>
    this.generatedSets().reduce((n, s) => n + s.questions.length, 0),
  );
  selectedSetQuestionsCount = computed(() =>
    this.generatedSets().reduce((n, s) => n + s.questions.filter((q) => q.selected).length, 0),
  );

  /**
   * Separate selection state derived from stable question ids.
   * Keyed by set title so original `generatedSets` question data
   * (text/options/answer/...) is never mutated for selection purposes
   * beyond the per-question `selected` flag which travels with the object.
   * Example: { "Subject Set A": ["set-A-1"], "Subject Set B": ["set-B-0","set-B-3"] }
   */
  selectedQuestionsMap = computed<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    for (const s of this.generatedSets()) {
      map[s.title] = s.questions
        .map((q, qi) => ({ q, qi }))
        .filter(({ q }) => q.selected)
        .map(({ q, qi }) => this.getSetQuestionId(s, q, qi));
    }
    return map;
  });

  ngOnInit() {
    this.loadSubjects();
  }

  loadSubjects() {
    this.loadingSubjects.set(true);
    this.subjectService.getSubjects().subscribe({
      next: (res) => {
        this.subjects.set(res.subjects);
        this.loadingSubjects.set(false);
        if (res.subjects.length > 0) {
          this.formSubjectId.set(res.subjects[0].id);
          this.onSubjectChange(res.subjects[0].id);
        }
      },
      error: () => {
        this.loadingSubjects.set(false);
      },
    });
  }

  onSubjectChange(subjectId: string) {
    this.formSubjectId.set(subjectId);
    this.formSyllabusId.set('');
    this.syllabi.set([]);

    if (!subjectId) return;

    this.loadingSyllabi.set(true);
    this.syllabusService.getSyllabi(undefined, subjectId).subscribe({
      next: (res) => {
        this.syllabi.set(res.syllabi);
        this.loadingSyllabi.set(false);
        if (res.syllabi.length > 0) {
          this.formSyllabusId.set(res.syllabi[0].id);
        }
      },
      error: () => {
        this.loadingSyllabi.set(false);
      },
    });
  }

  get selectedSyllabus(): Syllabus | undefined {
    return this.syllabi().find((s) => s.id === this.formSyllabusId());
  }

  /** Stable unique id for a question inside a set. Prefers backend `q.id`
   *  (`set-A-0`) and falls back to a deterministic setLabel+index id.
   *  Never rely on array index alone at call sites. */
  getSetQuestionId(set: GeneratedPaperSet, q: GeneratedQuestion, qi: number): string {
    return q.id || `set-${set.setLabel}-${qi}`;
  }

  setSelectedQuestionCount(set: GeneratedPaperSet): number {
    return set.questions.filter((q) => q.selected).length;
  }

  isSetFullySelected(set: GeneratedPaperSet): boolean {
    return set.questions.length > 0 && set.questions.every((q) => q.selected);
  }

  isSetPartial(set: GeneratedPaperSet): boolean {
    const count = this.setSelectedQuestionCount(set);
    return count > 0 && count < set.questions.length;
  }

  get syllabusTopics(): { name: string; weightage: number }[] {
    return this.selectedSyllabus?.topics || [];
  }

  generate() {
    if (!this.formSubjectId()) {
      this.error.set('Please select a subject');
      return;
    }
    const setCount = Math.floor(Number(this.formSetCount()) || 1);
    if (setCount < 1 || setCount > 5) {
      this.error.set('Number of sets must be between 1 and 5');
      return;
    }

    this.error.set('');
    this.successMessage.set('');
    this.generationWarnings.set([]);
    this.generating.set(true);

    const payload = {
      subjectId: this.formSubjectId(),
      syllabusId: this.formSyllabusId() || undefined,
      topic: this.formTopic() || undefined,
      count: this.formCount(),
      difficulty: this.formDifficulty(),
      type: this.formType(),
      marks: this.formMarks(),
      instructions: this.formInstructions() || undefined,
    };
    console.log('[AI Generate] request payload:', payload);

    if (setCount > 1) {
      this.generatedQuestions.set([]);
      this.aiService.generateSets({ ...payload, setCount }).subscribe({
        next: (res) => {
          this.generatedSets.set(
            res.sets.map((s) => ({
              ...s,
              selected: true,
              previewOpen: false,
              // Default: all individual questions selected (preserves existing
              // full-set behaviour). Ensure every question has a stable id and
              // an explicit per-question selection flag. Original question
              // data (text/options/...) is copied, never restructured.
              questions: s.questions.map((q, qi) => ({
                ...q,
                id: q.id || `set-${s.setLabel}-${qi}`,
                selected: true,
              })),
            })),
          );
          this.generationWarnings.set(res.warnings || []);
          this.generating.set(false);
          if (res.sets.length === 0) {
            this.error.set('No paper sets were generated. Please try again.');
          }
        },
        error: (err) => {
          this.generating.set(false);
          this.error.set(err.error?.message || 'Failed to generate paper sets. Please try again.');
        },
      });
      return;
    }

    this.generatedSets.set([]);
    this.aiService.generateQuestions(payload).subscribe({
      next: (res) => {
        const questions = res.questions.map((q) => ({
          ...q,
          selected: true,
          editing: false,
        }));
        this.generatedQuestions.set(questions);
        this.generationWarnings.set(res.warnings || []);
        this.generating.set(false);
        if (questions.length === 0) {
          this.error.set('No questions were generated. Please try again.');
        }
      },
      error: (err) => {
        this.generating.set(false);
        this.error.set(err.error?.message || 'Failed to generate questions. Please try again.');
      },
    });
  }

  regenerate() {
    this.generate();
  }

  toggleSelectAll() {
    const allSelected = this.selectedCount() === this.generatedQuestions().length;
    this.generatedQuestions.update((qs) => qs.map((q) => ({ ...q, selected: !allSelected })));
  }

  toggleSelect(index: number) {
    this.generatedQuestions.update((qs) =>
      qs.map((q, i) => (i === index ? { ...q, selected: !q.selected } : q)),
    );
  }

  removeQuestion(index: number) {
    this.generatedQuestions.update((qs) => qs.filter((_, i) => i !== index));
  }

  startEdit(index: number) {
    const q = this.generatedQuestions()[index];
    this.editingIndex.set(index);
    this.editText.set(q.text);
    this.editAnswer.set(q.answer);
    this.editTopic.set(q.topic);
    this.editOptions.set([...q.options]);
  }

  cancelEdit() {
    this.editingIndex.set(-1);
    this.editText.set('');
    this.editAnswer.set('');
    this.editTopic.set('');
    this.editOptions.set([]);
  }

  saveEdit() {
    const idx = this.editingIndex();
    if (idx < 0) return;

    this.generatedQuestions.update((qs) =>
      qs.map((q, i) =>
        i === idx
          ? {
              ...q,
              text: this.editText(),
              answer: this.editAnswer(),
              topic: this.editTopic(),
              options: [...this.editOptions()],
            }
          : q,
      ),
    );
    this.cancelEdit();
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

  updateOptionLabels(type: string, qIndex: number, optIndex: number, value: string) {
    if (type === 'MCQ') {
      const q = this.generatedQuestions()[qIndex];
      const opts = [...q.options];
      opts[optIndex] = value;
      this.generatedQuestions.update((qs) =>
        qs.map((q, i) => (i === qIndex ? { ...q, options: opts } : q)),
      );
    }
  }

  saveSelected() {
    const selected = this.generatedQuestions().filter((q) => q.selected);
    if (selected.length === 0) {
      this.error.set('Please select at least one question to save');
      return;
    }

    if (!this.formSubjectId()) {
      this.error.set('Please select a subject');
      return;
    }

    this.error.set('');
    this.saving.set(true);

    this.aiService
      .saveGeneratedQuestions({
        subjectId: this.formSubjectId(),
        questions: selected,
      })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          this.successMessage.set(res.message);

          if (res.skipped && res.skipped.length > 0) {
            const skippedMsg = res.skipped
              .map((s) => `"${s.text.substring(0, 40)}..." - ${s.reason}`)
              .join('; ');
            this.successMessage.set(`${res.message} Skipped: ${skippedMsg}`);
          }

          this.generatedQuestions.update((qs) => qs.filter((q) => !q.selected));

          setTimeout(() => this.successMessage.set(''), 8000);
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err.error?.message || 'Failed to save questions. Please try again.');
        },
      });
  }

  toggleSetSelectAll() {
    const allSelected =
      this.totalSetQuestionsCount() > 0 &&
      this.selectedSetQuestionsCount() === this.totalSetQuestionsCount();
    this.generatedSets.update((sets) =>
      sets.map((s) => ({
        ...s,
        selected: !allSelected,
        questions: s.questions.map((q) => ({ ...q, selected: !allSelected })),
      })),
    );
  }

  toggleSetSelect(index: number) {
    this.generatedSets.update((sets) =>
      sets.map((s, i) => {
        if (i !== index) return s;
        const next = !this.isSetFullySelected(s);
        return {
          ...s,
          selected: next,
          questions: s.questions.map((q) => ({ ...q, selected: next })),
        };
      }),
    );
  }

  toggleSetQuestionSelect(setIndex: number, qIndex: number) {
    this.generatedSets.update((sets) =>
      sets.map((s, i) => {
        if (i !== setIndex) return s;
        const questions = s.questions.map((q, qi) =>
          qi === qIndex ? { ...q, selected: !q.selected } : q,
        );
        return {
          ...s,
          questions,
          selected: questions.length > 0 && questions.every((q) => q.selected),
        };
      }),
    );
  }

  toggleSetPreview(index: number) {
    this.generatedSets.update((sets) =>
      sets.map((s, i) => (i === index ? { ...s, previewOpen: !s.previewOpen } : s)),
    );
  }

  saveSelectedSets() {
    // Include sets with at least one individually selected question.
    // MODE 1 (full set): all questions selected -> complete set saved (existing behaviour).
    // MODE 2 (partial): only selected questions saved, unselected excluded.
    const selected = this.generatedSets()
      .map((s) => ({
        set: s,
        selectedQuestions: s.questions.map((q, qi) => ({ q, qi })).filter(({ q }) => q.selected),
      }))
      .filter((entry) => entry.selectedQuestions.length > 0);
    if (selected.length === 0) {
      this.error.set('Please select at least one set to save');
      return;
    }

    this.error.set('');
    this.savingSets.set(true);

    const savedTitles: string[] = [];
    const saveNext = (index: number): void => {
      if (index >= selected.length) {
        this.savingSets.set(false);
        this.successMessage.set(
          `${savedTitles.length} paper set(s) saved to Paper History: ${savedTitles.join(', ')}`,
        );
        const savedSet = new Set(savedTitles);
        this.generatedSets.update((sets) => sets.filter((s) => !savedSet.has(s.title)));
        setTimeout(() => this.successMessage.set(''), 8000);
        return;
      }
      const set = selected[index].set;
      const selectedQs = selected[index].selectedQuestions;
      this.paperService
        .savePaper({
          title: set.title,
          subjectId: set.subjectId,
          questions: selectedQs.map(({ q, qi }) => ({
            id: this.getSetQuestionId(set, q, qi),
            text: q.text,
            type: q.type,
            difficulty: q.difficulty,
            options: q.options || [],
            answer: q.answer || '',
            marks: q.marks,
            topic: q.topic || '',
            source: q.source || 'AI Generated',
          })),
          totalMarks: selectedQs.reduce((sum, { q }) => sum + (q.marks || 0), 0),
          duration: set.duration,
          syllabus: set.syllabusId || undefined,
          instructions: this.formInstructions() || undefined,
        })
        .subscribe({
          next: () => {
            savedTitles.push(set.title);
            saveNext(index + 1);
          },
          error: (err) => {
            this.savingSets.set(false);
            this.error.set(
              err.error?.message ||
                `Failed to save ${set.title}. ${savedTitles.length} set(s) saved.`,
            );
          },
        });
    };
    saveNext(0);
  }

  logout() {
    this.authService.logout();
  }
}
