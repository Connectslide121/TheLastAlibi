import { Component } from '@angular/core';

@Component({
  selector: 'app-investigation-view',
  standalone: true,
  template: `
    <div class="flex items-center justify-center h-screen bg-[var(--color-primary)]">
      <p class="text-[var(--color-text)]">Investigation</p>
    </div>
  `,
})
export class InvestigationView {}
