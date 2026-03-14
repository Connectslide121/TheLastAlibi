import { Component } from '@angular/core';

@Component({
  selector: 'app-accusation-view',
  standalone: true,
  template: `
    <div class="flex items-center justify-center h-screen bg-(--color-primary)">
      <p class="text-(--color-text)">Make your accusation</p>
    </div>
  `,
})
export class AccusationView {}
