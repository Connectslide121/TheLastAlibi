import { Component, input, output } from '@angular/core';
import { Suspect } from '../../models';

@Component({
  selector: 'app-suspect-card',
  standalone: true,
  template: `
    <button
      type="button"
      (click)="cardClicked.emit(suspect())"
      class="w-full text-left rounded overflow-hidden border bg-(--color-surface) transition-all cursor-pointer"
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
          <svg
            class="w-16 h-16 opacity-20"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"
            />
          </svg>
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
          <span class="text-xs text-green-400 opacity-80 mt-1">✓ Interviewed</span>
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
