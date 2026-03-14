import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./views/home-view/home-view').then((m) => m.HomeView),
  },
  {
    path: 'generate',
    loadComponent: () =>
      import('./views/generate-view/generate-view').then((m) => m.GenerateView),
  },
  {
    path: 'investigation',
    loadComponent: () =>
      import('./views/investigation-view/investigation-view').then(
        (m) => m.InvestigationView,
      ),
  },
  {
    path: 'evidence-board',
    loadComponent: () =>
      import('./views/evidence-board-view/evidence-board-view').then(
        (m) => m.EvidenceBoardView,
      ),
  },
  {
    path: 'accusation',
    loadComponent: () =>
      import('./views/accusation-view/accusation-view').then(
        (m) => m.AccusationView,
      ),
  },
  {
    path: 'reveal',
    loadComponent: () =>
      import('./views/reveal-view/reveal-view').then((m) => m.RevealView),
  },
  { path: '**', redirectTo: '' },
];
