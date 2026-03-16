import { Component, input } from '@angular/core';
import { Clue } from '../../models';

@Component({
  selector: 'app-clue-card',
  standalone: true,
  template: `
    <div
      class="clue-reveal-enter relative rounded overflow-hidden border bg-(--color-surface) transition-colors"
      style="border-color: rgba(201,168,76,0.3);"
    >
      <div
        class="w-full overflow-hidden bg-(--color-secondary) flex items-center justify-center"
        [class.aspect-square]="variant() === 'full' || variant() === 'preview'"
        [class.aspect-[4/3]]="variant() === 'compact'"
      >
        @if (clue().imageUrl) {
          <img [src]="clue().imageUrl" [alt]="clue().name" class="w-full h-full object-cover" />
        } @else {
          <span class="material-icons mi-2xl opacity-20">search</span>
        }
      </div>

      @if (showTruth() && clue().isRedHerring) {
        <span
          class="absolute top-2 right-2 bg-red-700 text-white text-xs px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1"
        >
          <span class="material-icons mi-sm">warning</span>
          Red Herring
        </span>
      }

      @if (variant() !== 'preview') {
        <div class="p-3">
          <h3 class="text-(--color-accent) font-serif font-bold text-sm leading-tight text-center">
            {{ clue().name }}
          </h3>
        </div>
      }
    </div>
  `,
})
export class ClueCardComponent {
  readonly clue = input.required<Clue>();
  readonly showTruth = input(false);
  readonly variant = input<'full' | 'compact' | 'preview'>('full');
}
