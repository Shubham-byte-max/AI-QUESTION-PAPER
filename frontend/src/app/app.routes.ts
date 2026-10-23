import { Routes } from '@angular/router';
import { authGuard, loginGuard, registerGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [loginGuard],
    loadComponent: () => import('./components/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [registerGuard],
    loadComponent: () =>
      import('./components/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'subjects',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/subjects/subjects.component').then((m) => m.SubjectsComponent),
  },
  {
    path: 'syllabus',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/syllabus/syllabus.component').then((m) => m.SyllabusComponent),
  },
  {
    path: 'questions',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/questions/questions.component').then((m) => m.QuestionsComponent),
  },
  {
    path: 'generate',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/ai-generator/ai-generator.component').then(
        (m) => m.AiGeneratorComponent,
      ),
  },
  {
    path: 'patterns',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/exam-pattern/exam-pattern.component').then(
        (m) => m.ExamPatternComponent,
      ),
  },
  {
    path: 'papers',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/paper-generator/paper-generator.component').then(
        (m) => m.PaperGeneratorComponent,
      ),
  },
  {
    path: 'papers/preview',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/paper-preview/paper-preview.component').then(
        (m) => m.PaperPreviewComponent,
      ),
  },
  {
    path: 'papers/history',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/history/history.component').then((m) => m.HistoryComponent),
  },
  {
    path: 'papers/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/paper-preview/paper-preview.component').then(
        (m) => m.PaperPreviewComponent,
      ),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/profile/profile.component').then((m) => m.ProfileComponent),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/settings/settings.component').then((m) => m.SettingsComponent),
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'dashboard' },
];
