import { Component } from '@angular/core';

@Component({
  selector: 'app-generate-view',
  standalone: true,
  template: `
    <div class="flex items-center justify-center h-screen bg-(--color-primary)">
      <p class="text-(--color-text)">Generating case…</p>
    </div>
  `,
})
export class GenerateView {}
