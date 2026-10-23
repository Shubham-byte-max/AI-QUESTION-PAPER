import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { DashboardService, DashboardResponse } from '../../services/dashboard.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  authService = inject(AuthService);
  private dashboardService = inject(DashboardService);
  private router = inject(Router);

  loading = signal(true);
  error = signal('');
  data = signal<DashboardResponse | null>(null);

  ngOnInit() {
    this.loadDashboard();
  }

  loadDashboard() {
    this.loading.set(true);
    this.error.set('');

    this.dashboardService.getDashboard().subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load dashboard data. Please try again.');
        this.loading.set(false);
      },
    });
  }

  navigateToGenerate() {
    this.router.navigate(['/generate']);
  }

  logout() {
    this.authService.logout();
  }

  getDifficultyTotal(): number {
    const d = this.data()?.difficultySummary;
    if (!d) return 0;
    return d.Easy + d.Medium + d.Hard;
  }

  getDifficultyPercent(value: number): number {
    const total = this.getDifficultyTotal();
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  }

  getTypeEntries(): { type: string; count: number; percent: number }[] {
    const types = this.data()?.typeSummary;
    if (!types) return [];
    const entries = Object.entries(types);
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    return entries.map(([type, count]) => ({
      type,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}
