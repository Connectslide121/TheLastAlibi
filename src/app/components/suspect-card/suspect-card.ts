import { Component, input, output } from '@angular/core';
import { Suspect } from '../../models';

@Component({
  selector: 'app-suspect-card',
  standalone: true,
  template: `
    <button
      type="button"
      (click)="cardClicked.emit(suspect())"
      class="suspect-slide-in w-full text-left rounded overflow-hidden border bg-(--color-surface) transition-all cursor-pointer"
      [class.opacity-70]="!isInterviewed()"
      [style.border-color]="isInterviewed() ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'"
    >
      <div
        class="w-full aspect-square overflow-hidden bg-(--color-secondary) flex items-center justify-center"
      >
        @if (suspect().imageUrl) {
          <img
            [src]="suspect().imageUrl"
            [alt]="suspect().name"
            class="w-full h-full object-cover"
          />
        } @else {
          <span class="material-icons mi-2xl opacity-20">person</span>
        }
      </div>

      <div class="p-3 flex flex-col gap-1">
        <h3 class="text-(--color-accent) font-serif font-bold text-sm leading-tight">
          {{ suspect().name }}
        </h3>
        <p class="text-(--color-text) text-xs opacity-60 mt-0.5">{{ suspect().occupation }}</p>
        <p class="text-(--color-text) text-xs opacity-70 mt-1 line-clamp-2">
          {{ suspect().description }}
        </p>
        @if (isInterviewed()) {
          <span class="text-xs text-green-400 opacity-80 mt-1 flex items-center gap-1">
            <span class="material-icons mi-sm">check_circle</span>
            Interviewed
          </span>
        }
      </div>
    </button>
  `,
})
export class SuspectCardComponent {
  readonly suspect = input.required<Suspect>();
  readonly isInterviewed = input(false);
  readonly cardClicked = output<Suspect>();
}
