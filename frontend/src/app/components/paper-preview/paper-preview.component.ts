import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SubjectService, Subject } from '../../services/subject.service';
import { PaperService, PaperQuestion, Paper, SectionDetail } from '../../services/paper.service';

@Component({
  selector: 'app-paper-preview',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './paper-preview.component.html',
  styleUrl: './paper-preview.component.css',
})
export class PaperPreviewComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private paperService = inject(PaperService);
  private subjectService = inject(SubjectService);

  // Paper data
  paper = signal<Paper | null>(null);
  paperId = signal('');
  subjects = signal<Subject[]>([]);
  // Multiple paper sets (same config, unique questions per set)
  papers = signal<Paper[] | null>(null);
  activeSetIndex = signal(0);

  // UI state
  loading = signal(true);
  saving = signal(false);
  error = signal('');
  successMessage = signal('');

  // Edit modal state
  showEditModal = signal(false);
  editIndex = signal(-1);
  editText = signal('');
  editAnswer = signal('');
  editTopic = signal('');
  editOptions = signal<string[]>([]);
  editMarks = signal(1);
  editDifficulty = signal('Medium');
  editType = signal('Short Answer');

  // Add question modal
  showAddModal = signal(false);
  addText = signal('');
  addAnswer = signal('');
  addTopic = signal('');
  addOptions = signal<string[]>(['', '']);
  addMarks = signal(2);
  addDifficulty = signal('Medium');
  addType = signal('Short Answer');

  // Delete confirmation
  showDeleteConfirm = signal(false);
  deleteIndex = signal(-1);

  questionTypes = ['MCQ', 'Short Answer', 'Long Answer', 'True/False', 'Fill in the Blanks'];
  difficulties = ['Easy', 'Medium', 'Hard'];

  // Computed: grouped questions by section
  sections = computed(() => {
    const questions = this.paper()?.questions || [];
    if (questions.length === 0) return [];

    // Build a map of section details (instruction / attempt) from paper data
    const sectionDetails = (this.paper() as any)?.sectionDetails || [];
    const detailMap = new Map<string, SectionDetail>();
    for (const d of sectionDetails) {
      detailMap.set(d.name, d);
    }

    const grouped: {
      name: string;
      questions: PaperQuestion[];
      instruction?: string;
      detail?: SectionDetail;
    }[] = [];
    const sectionMap = new Map<string, PaperQuestion[]>();

    for (const q of questions) {
      const sectionName = q.section || 'Questions';
      if (!sectionMap.has(sectionName)) {
        sectionMap.set(sectionName, []);
      }
      sectionMap.get(sectionName)!.push(q);
    }

    for (const [name, qs] of sectionMap) {
      const detail = detailMap.get(name);
      grouped.push({ name, questions: qs, instruction: detail?.instruction, detail });
    }

    return grouped;
  });

  actualTotalMarks = computed(() => {
    const p = this.paper();
    if (!p) return 0;
    const details = p.sectionDetails || [];
    if (details.length > 0) {
      return details.reduce(
        (sum, d) => sum + (d.attemptQuestions || d.questionCount) * d.marksPerQuestion,
        0,
      );
    }
    return (p.questions || []).reduce((sum, q) => sum + q.marks, 0);
  });

  ngOnInit() {
    this.blankDocumentTitleForPaperPrint();
    this.loadSubjects();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.paperId.set(id);
      this.loadPaper(id);
    } else {
      // Check navigation state for generated paper(s)
      const nav = this.router.getCurrentNavigation();
      const state = history.state;
      if (state && Array.isArray(state.papers) && state.papers.length > 0) {
        this.papers.set(state.papers);
        this.activeSetIndex.set(0);
        this.paper.set(state.papers[0]);
        this.paperId.set('');
        this.loading.set(false);
      } else if (state && state.paper) {
        this.papers.set([state.paper]);
        this.activeSetIndex.set(0);
        this.paper.set(state.paper);
        this.paperId.set(state.paperId || '');
        this.loading.set(false);
      } else {
        this.loading.set(false);
        this.error.set('No paper data found. Please generate a paper first.');
      }
    }
  }

  hasMultipleSets(): boolean {
    return !!this.papers() && this.papers()!.length > 1;
  }

  switchSet(index: number) {
    const sets = this.papers();
    if (!sets || index < 0 || index >= sets.length || index === this.activeSetIndex()) return;
    // Persist edits made to the currently displayed set before switching.
    const current = this.paper();
    if (current) {
      sets[this.activeSetIndex()] = current;
    }
    this.activeSetIndex.set(index);
    this.paper.set(sets[index]);
    this.error.set('');
  }

  loadSubjects() {
    this.subjectService.getSubjects().subscribe({
      next: (res) => this.subjects.set(res.subjects),
      error: () => {},
    });
  }

  loadPaper(id: string) {
    this.loading.set(true);
    this.error.set('');
    this.paperService.getPaper(id).subscribe({
      next: (res) => {
        this.paper.set(res.paper);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message || 'Failed to load paper.');
      },
    });
  }

  // ---- Edit Question ----
  openEditModal(index: number) {
    const q = this.paper()!.questions[index];
    this.editIndex.set(index);
    this.editText.set(q.text);
    this.editAnswer.set(q.answer);
    this.editTopic.set(q.topic);
    this.editOptions.set([...q.options]);
    this.editMarks.set(q.marks);
    this.editDifficulty.set(q.difficulty);
    this.editType.set(q.type);
    this.showEditModal.set(true);
  }

  closeEditModal() {
    this.showEditModal.set(false);
    this.editIndex.set(-1);
  }

  saveEdit() {
    const idx = this.editIndex();
    if (idx < 0) return;
    this.paper.update((p) => {
      if (!p) return p;
      const questions = p.questions.map((q, i) =>
        i === idx
          ? {
              ...q,
              text: this.editText(),
              answer: this.editAnswer(),
              topic: this.editTopic(),
              options: [...this.editOptions()],
              marks: this.editMarks(),
              difficulty: this.editDifficulty(),
              type: this.editType(),
            }
          : q,
      );
      return { ...p, questions };
    });
    this.closeEditModal();
  }

  updateEditOption(index: number, value: string) {
    const opts = [...this.editOptions()];
    opts[index] = value;
    this.editOptions.set(opts);
  }

  addEditOption() {
    this.editOptions.update((o) => [...o, '']);
  }

  removeEditOption(index: number) {
    this.editOptions.update((o) => o.filter((_, i) => i !== index));
  }

  // ---- Delete Question ----
  confirmDelete(index: number) {
    this.deleteIndex.set(index);
    this.showDeleteConfirm.set(true);
  }

  cancelDelete() {
    this.showDeleteConfirm.set(false);
    this.deleteIndex.set(-1);
  }

  deleteQuestion() {
    const idx = this.deleteIndex();
    if (idx < 0) return;
    this.paper.update((p) => {
      if (!p) return p;
      return { ...p, questions: p.questions.filter((_, i) => i !== idx) };
    });
    this.cancelDelete();
  }

  // ---- Add Question ----
  openAddModal() {
    this.addText.set('');
    this.addAnswer.set('');
    this.addTopic.set('');
    this.addOptions.set(['', '']);
    this.addMarks.set(2);
    this.addDifficulty.set('Medium');
    this.addType.set('Short Answer');
    this.showAddModal.set(true);
  }

  closeAddModal() {
    this.showAddModal.set(false);
  }

  saveAdd() {
    const text = this.addText().trim();
    if (!text || text.length < 5) return;
    const newQ: PaperQuestion = {
      id: `new-${Date.now()}`,
      text,
      type: this.addType(),
      difficulty: this.addDifficulty(),
      options:
        this.addType() === 'MCQ'
          ? this.addOptions().filter((o) => o.trim())
          : this.addType() === 'True/False'
            ? ['True', 'False']
            : [],
      answer: this.addAnswer(),
      marks: this.addMarks(),
      topic: this.addTopic(),
      source: 'Manual',
    };
    this.paper.update((p) => {
      if (!p) return p;
      return { ...p, questions: [...p.questions, newQ] };
    });
    this.closeAddModal();
  }

  updateAddOption(index: number, value: string) {
    const opts = [...this.addOptions()];
    opts[index] = value;
    this.addOptions.set(opts);
  }

  addAddOption() {
    this.addOptions.update((o) => [...o, '']);
  }

  removeAddOption(index: number) {
    this.addOptions.update((o) => o.filter((_, i) => i !== index));
  }

  // ---- Reorder ----
  moveQuestion(index: number, direction: -1 | 1) {
    this.paper.update((p) => {
      if (!p) return p;
      const questions = [...p.questions];
      const newIdx = index + direction;
      if (newIdx < 0 || newIdx >= questions.length) return p;
      [questions[index], questions[newIdx]] = [questions[newIdx], questions[index]];
      return { ...p, questions };
    });
  }

  // ---- Regenerate ----
  regenerateQuestion(index: number) {
    const q = this.paper()?.questions[index];
    if (!q) return;
    const paper = this.paper();
    if (!paper) return;

    this.paper.update((p) => {
      if (!p) return p;
      const questions = p.questions.map((item, i) =>
        i === index ? { ...item, regenerating: true } : item,
      );
      return { ...p, questions };
    });

    this.paperService
      .regenerateQuestion({
        subjectId: paper.subjectId,
        type: q.type,
        difficulty: q.difficulty,
        marks: q.marks,
        topic: q.topic || undefined,
      })
      .subscribe({
        next: (res) => {
          this.paper.update((p) => {
            if (!p) return p;
            const questions = p.questions.map((item, i) =>
              i === index ? { ...res.question, section: q.section } : item,
            );
            return { ...p, questions };
          });
        },
        error: () => {
          this.paper.update((p) => {
            if (!p) return p;
            const questions = p.questions.map((item, i) =>
              i === index ? { ...item, regenerating: false } : item,
            );
            return { ...p, questions };
          });
          this.showError('Failed to regenerate question.');
        },
      });
  }

  // ---- Save ----
  savePaper() {
    const p = this.paper();
    if (!p) return;
    if (p.questions.length === 0) {
      this.showError('Paper must contain at least one question.');
      return;
    }

    this.saving.set(true);
    this.error.set('');

    const payload = {
      title: p.title,
      subjectId: p.subjectId,
      questions: p.questions,
      totalMarks: p.totalMarks,
      duration: p.duration,
      examPattern: p.examPatternId || undefined,
      syllabus: p.syllabusId || undefined,
      instructions: p.instructions || undefined,
      sectionDetails: (p as any).sectionDetails || undefined,
    };

    const req$ = this.paperId()
      ? this.paperService.updatePaper(this.paperId(), payload)
      : this.paperService.savePaper(payload);

    req$.subscribe({
      next: (res: any) => {
        this.saving.set(false);
        if (res.paper?.id && !this.paperId()) {
          this.paperId.set(res.paper.id);
          this.router.navigate(['/papers', res.paper.id], { replaceUrl: true });
        }
        this.successMessage.set('Paper saved successfully!');
        setTimeout(() => this.successMessage.set(''), 4000);
      },
      error: (err) => {
        this.saving.set(false);
        this.showError(err.error?.message || 'Failed to save paper.');
      },
    });
  }

  // ---- Save all sets (multiple paper sets, same config) ----
  saveAllSets() {
    const sets = this.papers();
    const current = this.paper();
    if (!sets || sets.length === 0 || !current) return;
    // Include edits made to the currently displayed set.
    sets[this.activeSetIndex()] = current;
    for (const s of sets) {
      if (!s.questions || s.questions.length === 0) {
        this.showError('Every set must contain at least one question.');
        return;
      }
    }

    this.saving.set(true);
    this.error.set('');
    const savedIds: string[] = [];
    const saveNext = (index: number): void => {
      if (index >= sets.length) {
        this.saving.set(false);
        this.successMessage.set(`${savedIds.length} paper sets saved successfully!`);
        setTimeout(() => this.successMessage.set(''), 4000);
        return;
      }
      const s = sets[index];
      this.paperService
        .savePaper({
          title: s.title,
          subjectId: s.subjectId,
          questions: s.questions,
          totalMarks: s.totalMarks,
          duration: s.duration,
          examPattern: s.examPatternId || undefined,
          syllabus: s.syllabusId || undefined,
          instructions: (s as any).instructions || undefined,
          sectionDetails: (s as any).sectionDetails || undefined,
        })
        .subscribe({
          next: (res: any) => {
            if (res.paper?.id) savedIds.push(res.paper.id);
            saveNext(index + 1);
          },
          error: (err) => {
            this.saving.set(false);
            this.showError(
              err.error?.message ||
                `Failed to save set ${index + 1}. ${savedIds.length} set(s) saved.`,
            );
          },
        });
    };
    saveNext(0);
  }

  // ---- Print ----
  printPaper() {
    window.print();
  }

  // ---- Download ----
  downloadPaper() {
    const p = this.paper();
    if (!p) return;

    const sectionDetails = (p as any)?.sectionDetails || [];
    const detailMap = new Map<string, SectionDetail>();
    for (const d of sectionDetails) {
      detailMap.set(d.name, d);
    }

    const sectionMap = new Map<string, typeof p.questions>();
    for (const q of p.questions) {
      const sectionName = q.section || 'Questions';
      if (!sectionMap.has(sectionName)) {
        sectionMap.set(sectionName, []);
      }
      sectionMap.get(sectionName)!.push(q);
    }

    let questionsHtml = '';
    for (const [sectionName, qs] of sectionMap) {
      let qNum = 1;
      const detail = detailMap.get(sectionName);

      let sectionMarksHtml = '';
      if (qs.length > 0) {
        const marks0 = qs[0].marks;
        const attempt =
          detail?.attemptQuestions && detail.attemptQuestions < qs.length
            ? detail.attemptQuestions
            : qs.length;
        sectionMarksHtml =
          attempt < qs.length
            ? `[${attempt} x ${marks0} = ${attempt * marks0} Marks]`
            : `[${qs.length} x ${marks0} = ${qs.reduce((sum, q) => sum + q.marks, 0)} Marks]`;
      }
      questionsHtml += `<div class="section-lead"><div class="section-title">${sectionName}${sectionMarksHtml ? ` <span style="text-transform:none;font-weight:600;">${sectionMarksHtml}</span>` : ''}</div>`;
      if (detail?.instruction) {
        questionsHtml += `<div class="section-instruction">${detail.instruction}</div>`;
      }
      questionsHtml += `</div>`;
      for (const item of qs) {
        questionsHtml += `<div class="question"><div class="question-header"><span class="qnum">${qNum}.</span><span class="qtext">${item.text}</span><span class="qmarks">[${item.marks} ${item.marks === 1 ? 'Mark' : 'Marks'}]</span></div>`;
        if (item.type === 'MCQ' && item.options.length) {
          questionsHtml += `<div class="options">${item.options.map((o, j) => `<div class="option">(${String.fromCharCode(65 + j)}) ${o}</div>`).join('')}</div>`;
        }
        questionsHtml += `</div>`;
        qNum++;
      }
    }

    const semester = this.getSubjectSemester();
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${p.title}</title>
<style>
  body { font-family: "Times New Roman", Times, serif; padding: 2cm; line-height: 1.6; color: #000; margin: 0; }
  h1 { text-align: center; font-size: 1.4rem; text-transform: uppercase; margin-bottom: 0.5rem; }
  .meta { text-align: center; font-size: 1rem; margin-bottom: 0.5rem; }
  .meta span { margin: 0 0.5rem; }
  hr { border: none; border-top: 1px solid #000; margin: 1rem 0; }
  hr.thick { border-top: 2px solid #000; }
  .instructions { margin-bottom: 1rem; }
  .instructions strong { text-decoration: underline; }
  .instructions ol { margin: 0.25rem 0 0; padding-left: 1.5rem; }
  .section-lead { break-inside: avoid; page-break-inside: avoid; break-after: avoid; page-break-after: avoid; }
  .section-title { font-weight: bold; font-size: 1.05rem; margin: 1rem 0 0.5rem; text-transform: uppercase; break-inside: avoid; page-break-inside: avoid; break-after: avoid; page-break-after: avoid; }
  .section-instruction { font-style: italic; font-weight: bold; color: #444; margin-bottom: 0.5rem; break-inside: avoid; page-break-inside: avoid; break-after: avoid; page-break-after: avoid; }
  .question { margin-bottom: 10px; break-inside: avoid; page-break-inside: avoid; }
  .question-header { display: flex; gap: 0.5rem; }
  .qnum { font-weight: 700; }
  .qtext { flex: 1; }
  .qmarks { font-weight: 600; white-space: nowrap; }
  .options { margin-left: 1.5rem; margin-top: 4px; break-inside: avoid; page-break-inside: avoid; }
  .option { margin-bottom: 2px; break-inside: avoid; page-break-inside: avoid; }
  .footer { text-align: center; font-weight: 600; font-size: 0.9rem; margin-top: 1rem; }
  @media print { body { padding: 1.5cm; } @page { size: A4; margin: 0; } }
</style>
</head>
<body>
  <div style="text-align:center;font-size:0.9rem;color:#666;margin-bottom:0.5rem;">${this.authService.user()?.collegeName || '[College / Institute Name]'}</div>
  <h1>${p.title}</h1>
  <div class="meta">
    <span><strong>Subject:</strong> ${p.subjectName || '-'} (${p.subjectCode || '-'})</span>
    ${this.getSubjectBoard() ? `<span><strong>Board:</strong> ${this.getSubjectBoard()}</span>` : ''}
    ${this.getSubjectClassLevel() ? `<span><strong>Class:</strong> ${this.getSubjectClassLevel()}</span>` : ''}
    ${semester ? `<span><strong>Semester:</strong> ${semester}</span>` : ''}
    ${p.examPattern ? `<span><strong>Pattern:</strong> ${p.examPattern}</span>` : ''}
    <span><strong>Duration:</strong> ${p.duration} min</span>
    <span><strong>Max Marks:</strong> ${p.totalMarks}</span>
  </div>
  <hr class="thick">
  <div class="instructions">
    <strong>Instructions:</strong>
    <ol>
      <li>All questions are compulsory.</li>
      <li>Draw neat diagrams wherever necessary.</li>
      <li>Figures to the right indicate full marks.</li>
      <li>Use of calculator is not allowed.</li>
    </ol>
  </div>
  <hr>
  ${questionsHtml}
  <hr class="thick">
  <div class="footer">
    <span>Total Questions: ${p.questions.length}</span> &nbsp;|&nbsp;
    <span>Total Marks: ${p.totalMarks}</span> &nbsp;|&nbsp;
    <span>Calculated: ${this.actualTotalMarks()}</span>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.title.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private originalDocumentTitle = '';

  private blankDocumentTitleForPaperPrint(): void {
    if (typeof document === 'undefined') return;
    this.originalDocumentTitle = document.title;
    document.title = '';
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined' && this.originalDocumentTitle) {
      document.title = this.originalDocumentTitle;
    }
  }

  showError(msg: string) {
    this.error.set(msg);
    setTimeout(() => this.error.set(''), 5000);
  }

  getSubjectSemester(): number | null {
    const p = this.paper();
    if (p?.semester) return p.semester;
    const sub = this.subjects().find((s) => s.id === p?.subjectId);
    return sub?.semester || null;
  }

  getSubjectBoard(): string {
    const p = this.paper();
    if (p?.board) return p.board;
    return this.subjects().find((s) => s.id === p?.subjectId)?.board || '';
  }

  getSubjectClassLevel(): string {
    const p = this.paper();
    if (p?.classLevel) return p.classLevel;
    return this.subjects().find((s) => s.id === p?.subjectId)?.classLevel || '';
  }

  logout() {
    this.authService.logout();
  }
}
