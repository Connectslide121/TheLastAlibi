import { Component } from '@angular/core';

@Component({
  selector: 'app-evidence-board-view',
  standalone: true,
  template: `
    <div class="flex items-center justify-center h-screen bg-(--color-primary)">
      <p class="text-(--color-text)">Evidence Board</p>
    </div>
  `,
})
export class EvidenceBoardView {}
