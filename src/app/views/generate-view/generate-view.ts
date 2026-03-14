import { Component } from '@angular/core';

@Component({
  selector: 'app-generate-view',
  standalone: true,
  template: `
    <div class="flex items-center justify-center h-screen bg-[var(--color-primary)]">
      <p class="text-[var(--color-text)]">Generating case…</p>
    </div>
  `,
})
export class GenerateView {}
