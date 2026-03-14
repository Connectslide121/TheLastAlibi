import { Component } from '@angular/core';

@Component({
  selector: 'app-home-view',
  standalone: true,
  template: `
    <div class="flex items-center justify-center h-screen bg-(--color-primary)">
      <h1 class="text-4xl font-bold text-(--color-accent)">The Last Alibi</h1>
    </div>
  `,
})
export class HomeView {}
