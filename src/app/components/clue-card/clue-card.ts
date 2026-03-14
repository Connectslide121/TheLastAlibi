import { Component, input } from '@angular/core';
import { Clue } from '../../models';

@Component({
  selector: 'app-clue-card',
  standalone: true,
  template: `
    <div
      class="relative rounded border bg-(--color-surface) p-4 flex flex-col gap-3 shadow-md transition-colors"
      style="border-color: rgba(201,168,76,0.3);"
    >
      <div
        class="w-full aspect-video overflow-hidden rounded bg-(--color-secondary) flex items-center justify-center"
      >
        @if (clue().imageUrl) {
          <img [src]="clue().imageUrl" [alt]="clue().name" class="w-full h-full object-cover" />
        } @else {
          <span class="text-sm italic opacity-30">[ No Image ]</span>
        }
      </div>

      @if (showTruth() && clue().isRedHerring) {
        <span
          class="absolute top-2 right-2 bg-red-700 text-white text-xs px-2 py-0.5 rounded uppercase tracking-wider"
        >
          Red Herring
        </span>
      }

      <h3 class="text-(--color-accent) font-serif font-bold text-base leading-tight">
        {{ clue().name }}
      </h3>
      <p class="text-(--color-text) text-sm leading-relaxed opacity-80">{{ clue().description }}</p>

      @if (showTruth()) {
        <p
          class="text-(--color-text) text-xs italic opacity-60 border-t pt-2"
          style="border-color: rgba(201,168,76,0.2);"
        >
          {{ clue().revealsInfo }}
        </p>
      }
    </div>
  `,
})
export class ClueCardComponent {
  readonly clue = input.required<Clue>();
  readonly showTruth = input(false);
}
