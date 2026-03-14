import { Component } from '@angular/core';

@Component({
  selector: 'app-reveal-view',
  standalone: true,
  template: `
    <div class="flex items-center justify-center h-screen bg-(--color-primary)">
      <p class="text-(--color-text)">The truth is revealed…</p>
    </div>
  `,
})
export class RevealView {}
