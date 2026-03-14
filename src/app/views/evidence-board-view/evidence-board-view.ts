import { Component } from '@angular/core';

@Component({
  selector: 'app-evidence-board-view',
  standalone: true,
  template: `
    <div class="flex items-center justify-center h-screen bg-[var(--color-primary)]">
      <p class="text-[var(--color-text)]">Evidence Board</p>
    </div>
  `,
})
export class EvidenceBoardView {}
