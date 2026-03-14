import { Component } from '@angular/core';

@Component({
  selector: 'app-home-view',
  standalone: true,
  template: `
    <div class="flex flex-col items-center justify-center h-screen bg-(--color-primary) gap-6">
      <img src="favicon.png" alt="The Last Alibi" class="w-24 h-24 object-contain drop-shadow-lg" />
      <h1 class="text-4xl font-bold text-(--color-accent)">The Last Alibi</h1>
    </div>
  `,
})
export class HomeView {}
