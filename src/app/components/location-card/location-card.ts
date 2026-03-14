import { Component, input, output } from '@angular/core';
// Aliased to avoid conflict with the browser's built-in Location type
import { Location as GameLocation } from '../../models';

@Component({
  selector: 'app-location-card',
  standalone: true,
  template: `
    <button
      type="button"
      (click)="cardClicked.emit(location())"
      class="w-full text-left rounded overflow-hidden border bg-(--color-surface) transition-all cursor-pointer"
      [class.opacity-80]="!isVisited()"
      [style.border-color]="isVisited() ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'"
    >
      <div
        class="w-full aspect-video overflow-hidden bg-(--color-secondary) flex items-center justify-center"
      >
        @if (location().imageUrl) {
          <img
            [src]="location().imageUrl"
            [alt]="location().name"
            class="w-full h-full object-cover"
          />
        } @else {
          <span class="text-sm italic opacity-30">[ No Image ]</span>
        }
      </div>

      <div class="p-3 flex flex-col gap-1">
        <h3 class="text-(--color-accent) font-serif font-bold text-sm leading-tight">
          {{ location().name }}
        </h3>
        <p class="text-(--color-text) text-xs opacity-70 leading-relaxed line-clamp-2">
          {{ location().atmosphere }}
        </p>
        @if (isVisited()) {
          <span class="text-xs text-green-400 opacity-80 mt-1">✓ Visited</span>
        }
      </div>
    </button>
  `,
})
export class LocationCardComponent {
  readonly location = input.required<GameLocation>();
  readonly isVisited = input(false);
  readonly cardClicked = output<GameLocation>();
}
