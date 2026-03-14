import { Component } from '@angular/core';

@Component({
  selector: 'app-reveal-view',
  standalone: true,
  template: `
    <div class="flex items-center justify-center h-screen bg-[var(--color-primary)]">
      <p class="text-[var(--color-text)]">The truth is revealed…</p>
    </div>
  `,
})
export class RevealView {}
