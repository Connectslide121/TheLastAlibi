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
      style="border-color: rgba(255,255,255,0.1)"
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
          <span class="material-icons mi-2xl opacity-20">location_city</span>
        }
      </div>

      <div class="p-3">
        <h3 class="text-(--color-accent) font-serif font-bold text-sm leading-tight text-center">
          {{ location().name }}
        </h3>
      </div>
    </button>
  `,
})
export class LocationCardComponent {
  readonly location = input.required<GameLocation>();
  readonly isVisited = input(false);
  readonly cardClicked = output<GameLocation>();
}
