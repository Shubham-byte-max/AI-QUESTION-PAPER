import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { PaperService, Paper, PaperQuestion } from '../../services/paper.service';
import { SubjectService, Subject } from '../../services/subject.service';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './history.component.html',
  styleUrl: './history.component.css',
})
export class HistoryComponent implements OnInit {
  authService = inject(AuthService);
  private paperService = inject(PaperService);
  private subjectService = inject(SubjectService);
  private router = inject(Router);

  papers = signal<Paper[]>([]);
  subjects = signal<Subject[]>([]);
  loading = signal(true);
  error = signal('');
  searchQuery = signal('');
  searchTimeout: ReturnType<typeof setTimeout> | null = null;

  filterSubject = signal('');
  filterMarksMin = signal<number | null>(null);
  filterMarksMax = signal<number | null>(null);
  filterDurationMin = signal<number | null>(null);
  filterDurationMax = signal<number | null>(null);
  filterDateFrom = signal('');
  filterDateTo = signal('');

  showDeleteConfirm = signal(false);
  deletingPaper = signal<Paper | null>(null);
  deleting = signal(false);

  showPreviewModal = signal(false);
  previewPaper = signal<Paper | null>(null);
  previewLoading = signal(false);

  toastMessage = signal('');
  toastType = signal<'success' | 'error'>('success');
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    this.loadSubjects();
    this.loadPapers();
  }

  loadSubjects() {
    this.subjectService.getSubjects().subscribe({
      next: (res) => this.subjects.set(res.subjects),
      error: () => {},
    });
  }

  loadPapers() {
    this.loading.set(true);
    this.error.set('');

    const search = this.searchQuery() || undefined;

    this.paperService.getPapers(search).subscribe({
      next: (res) => {
        let papers = res.papers;

        if (this.filterSubject()) {
          papers = papers.filter((p) => p.subjectId === this.filterSubject());
        }
        if (this.filterMarksMin() !== null) {
          papers = papers.filter((p) => p.totalMarks >= this.filterMarksMin()!);
        }
        if (this.filterMarksMax() !== null) {
          papers = papers.filter((p) => p.totalMarks <= this.filterMarksMax()!);
        }
        if (this.filterDurationMin() !== null) {
          papers = papers.filter((p) => p.duration >= this.filterDurationMin()!);
        }
        if (this.filterDurationMax() !== null) {
          papers = papers.filter((p) => p.duration <= this.filterDurationMax()!);
        }
        if (this.filterDateFrom()) {
          const from = new Date(this.filterDateFrom());
          papers = papers.filter((p) => new Date(p.createdAt) >= from);
        }
        if (this.filterDateTo()) {
          const to = new Date(this.filterDateTo());
          to.setHours(23, 59, 59, 999);
          papers = papers.filter((p) => new Date(p.createdAt) <= to);
        }

        this.papers.set(papers);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load papers. Please try again.');
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
      this.loadPapers();
    }, 300);
  }

  clearSearch() {
    this.searchQuery.set('');
    this.loadPapers();
  }

  onFilterChange() {
    this.loadPapers();
  }

  clearFilters() {
    this.filterSubject.set('');
    this.filterMarksMin.set(null);
    this.filterMarksMax.set(null);
    this.filterDurationMin.set(null);
    this.filterDurationMax.set(null);
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.searchQuery.set('');
    this.loadPapers();
  }

  hasActiveFilters(): boolean {
    return !!(
      this.filterSubject() ||
      this.filterMarksMin() !== null ||
      this.filterMarksMax() !== null ||
      this.filterDurationMin() !== null ||
      this.filterDurationMax() !== null ||
      this.filterDateFrom() ||
      this.filterDateTo() ||
      this.searchQuery()
    );
  }

  viewPaper(paper: Paper) {
    this.router.navigate(['/papers', paper.id]);
  }

  editPaper(paper: Paper) {
    this.router.navigate(['/papers', paper.id]);
  }
  confirmDelete(paper: Paper) {
    this.deletingPaper.set(paper);
    this.showDeleteConfirm.set(true);
  }

  cancelDelete() {
    this.showDeleteConfirm.set(false);
    this.deletingPaper.set(null);
  }

  deletePaper() {
    const paper = this.deletingPaper();
    if (!paper) return;

    this.deleting.set(true);
    this.paperService.deletePaper(paper.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.showDeleteConfirm.set(false);
        this.deletingPaper.set(null);
        this.showToast('Paper deleted successfully', 'success');
        this.loadPapers();
      },
      error: (err) => {
        this.deleting.set(false);
        this.showToast(err.error?.message || 'Failed to delete paper', 'error');
      },
    });
  }

  // Print: fetch full paper and print
  printPaper(paper: Paper) {
    this.previewLoading.set(true);
    this.showPreviewModal.set(true);
    this.paperService.getPaper(paper.id).subscribe({
      next: (res) => {
        this.previewPaper.set(res.paper);
        this.previewLoading.set(false);
        setTimeout(() => {
          window.print();
          this.showPreviewModal.set(false);
          this.previewPaper.set(null);
        }, 200);
      },
      error: (err) => {
        this.previewLoading.set(false);
        this.showPreviewModal.set(false);
        this.showToast(err.error?.message || 'Failed to load paper for printing', 'error');
      },
    });
  }

  downloadPaper(paper: Paper) {
    this.paperService.getPaper(paper.id).subscribe({
      next: (res) => {
        const p = res.paper;
        // Group questions by section
        const sectionMap = new Map<string, PaperQuestion[]>();
        for (const item of p.questions) {
          const sectionName = (item as any).section || 'Questions';
          if (!sectionMap.has(sectionName)) {
            sectionMap.set(sectionName, []);
          }
          sectionMap.get(sectionName)!.push(item);
        }

        let questionsHtml = '';
        let qNum = 1;
        for (const [sectionName, qs] of sectionMap) {
          questionsHtml += `<div style="font-weight:bold;font-size:1.05rem;margin:1rem 0 0.5rem;text-transform:uppercase;">${sectionName}</div>`;
          for (const item of qs) {
            questionsHtml += `<div class="question"><div class="question-header"><span class="qnum">${qNum}.</span><span class="qtext">${item.text}</span><span class="qmarks">[${item.marks} ${item.marks === 1 ? 'Mark' : 'Marks'}]</span></div>`;
            if (item.type === 'MCQ' && item.options.length) {
              questionsHtml += `<div class="options">${item.options.map((o: string, j: number) => `<div class="option">(${String.fromCharCode(65 + j)}) ${o}</div>`).join('')}</div>`;
            }
            questionsHtml += `</div>`;
            qNum++;
          }
        }

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
  .question { margin-bottom: 10px; }
  .question-header { display: flex; gap: 0.5rem; }
  .qnum { font-weight: 700; }
  .qtext { flex: 1; }
  .qmarks { font-weight: 600; white-space: nowrap; }
  .options { margin-left: 1.5rem; margin-top: 4px; }
  .option { margin-bottom: 2px; }
  .footer { text-align: center; font-weight: 600; font-size: 0.9rem; margin-top: 1rem; }
  @media print { body { padding: 1.5cm; } @page { size: A4; margin: 0; } }
</style>
</head>
<body>
  <div style="text-align:center;font-size:0.9rem;color:#666;margin-bottom:0.5rem;">${this.authService.user()?.collegeName || '[College / Institute Name]'}</div>
  <h1>${p.title}</h1>
  <div class="meta">
    <span><strong>Subject:</strong> ${p.subjectName || '-'} (${p.subjectCode || '-'})</span>
    ${p.board ? `<span><strong>Board:</strong> ${p.board}</span>` : ''}
    ${p.classLevel ? `<span><strong>Class:</strong> ${p.classLevel}</span>` : ''}
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
    <span>Total Marks: ${p.totalMarks}</span>
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
        this.showToast('Paper downloaded successfully', 'success');
      },
      error: (err) => {
        this.showToast(err.error?.message || 'Failed to download paper', 'error');
      },
    });
  }

  closePreviewModal() {
    this.showPreviewModal.set(false);
    this.previewPaper.set(null);
  }

  printPreview() {
    window.print();
  }

  downloadPreview() {
    const p = this.previewPaper();
    if (!p) return;

    const sectionMap = new Map<string, PaperQuestion[]>();
    for (const item of p.questions) {
      const sectionName = (item as any).section || 'Questions';
      if (!sectionMap.has(sectionName)) {
        sectionMap.set(sectionName, []);
      }
      sectionMap.get(sectionName)!.push(item);
    }

    let questionsHtml = '';
    let qNum = 1;
    for (const [sectionName, qs] of sectionMap) {
      questionsHtml += `<div style="font-weight:bold;font-size:1.05rem;margin:1rem 0 0.5rem;text-transform:uppercase;">${sectionName}</div>`;
      for (const item of qs) {
        questionsHtml += `<div class="question"><div class="question-header"><span class="qnum">${qNum}.</span><span class="qtext">${item.text}</span><span class="qmarks">[${item.marks} ${item.marks === 1 ? 'Mark' : 'Marks'}]</span></div>`;
        if (item.type === 'MCQ' && item.options.length) {
          questionsHtml += `<div class="options">${item.options.map((o: string, j: number) => `<div class="option">(${String.fromCharCode(65 + j)}) ${o}</div>`).join('')}</div>`;
        }
        questionsHtml += `</div>`;
        qNum++;
      }
    }

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
  .question { margin-bottom: 10px; }
  .question-header { display: flex; gap: 0.5rem; }
  .qnum { font-weight: 700; }
  .qtext { flex: 1; }
  .qmarks { font-weight: 600; white-space: nowrap; }
  .options { margin-left: 1.5rem; margin-top: 4px; }
  .option { margin-bottom: 2px; }
  .footer { text-align: center; font-weight: 600; font-size: 0.9rem; margin-top: 1rem; }
  @media print { body { padding: 1.5cm; } @page { size: A4; margin: 0; } }
</style>
</head>
<body>
  <div style="text-align:center;font-size:0.9rem;color:#666;margin-bottom:0.5rem;">${this.authService.user()?.collegeName || '[College / Institute Name]'}</div>
  <h1>${p.title}</h1>
  <div class="meta">
    <span><strong>Subject:</strong> ${p.subjectName || '-'} (${p.subjectCode || '-'})</span>
    ${p.board ? `<span><strong>Board:</strong> ${p.board}</span>` : ''}
    ${p.classLevel ? `<span><strong>Class:</strong> ${p.classLevel}</span>` : ''}
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
    <span>Total Marks: ${p.totalMarks}</span>
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

  // Helpers
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

  formatDateTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }

  logout() {
    this.authService.logout();
  }
}
