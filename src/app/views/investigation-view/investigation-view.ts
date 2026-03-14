import { Component } from '@angular/core';

@Component({
  selector: 'app-investigation-view',
  standalone: true,
  template: `
    <div class="flex items-center justify-center h-screen bg-(--color-primary)">
      <p class="text-(--color-text)">Investigation</p>
    </div>
  `,
})
export class InvestigationView {}
