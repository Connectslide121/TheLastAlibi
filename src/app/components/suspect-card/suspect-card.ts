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
      style="border-color: rgba(255,255,255,0.1)"
    >
      <div
        class="w-full overflow-hidden bg-(--color-secondary) flex items-center justify-center"
        [class.aspect-square]="variant() === 'expanded' || variant() === 'preview'"
        [class.aspect-[4/3]]="variant() === 'compact'"
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

      @if (variant() !== 'preview') {
        <div class="p-3">
          <h3 class="text-(--color-accent) font-serif font-bold text-sm leading-tight text-center">
            {{ suspect().name }}
          </h3>
        </div>
      }
    </button>
  `,
})
export class SuspectCardComponent {
  readonly suspect = input.required<Suspect>();
  readonly isInterviewed = input(false);
  readonly variant = input<'compact' | 'expanded' | 'preview'>('expanded');
  readonly cardClicked = output<Suspect>();
}
