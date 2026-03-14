import { Component, input, output, signal, computed } from '@angular/core';
import { DialogueLine } from '../../models';

@Component({
  selector: 'app-dialogue-box',
  standalone: true,
  template: `
    <div
      class="fixed inset-0 flex items-end justify-center p-6 z-40"
      style="background: rgba(0,0,0,0.5);"
      (click)="advance()"
    >
      <div
        class="dialogue-enter w-full max-w-2xl rounded border bg-(--color-surface) shadow-2xl p-6 flex flex-col gap-4"
        style="border-color: rgba(201,168,76,0.4);"
        (click)="$event.stopPropagation()"
      >
        <!-- Speaker name -->
        <div class="flex items-center gap-2">
          <span class="material-icons mi-md text-(--color-accent)">record_voice_over</span>
          <h4 class="text-(--color-accent) font-serif font-bold text-base">
            {{ currentLine().speakerName }}
          </h4>
        </div>

        <!-- Dialogue text -->
        <p class="dialogue-text-reveal text-(--color-text) text-base leading-relaxed min-h-16">
          {{ currentLine().text }}
        </p>

        <!-- Footer: progress & action -->
        <div
          class="flex items-center justify-between text-xs opacity-40 pt-2 border-t"
          style="border-color: rgba(201,168,76,0.15);"
        >
          <span class="text-(--color-text)"> {{ currentIndex() + 1 }} / {{ lines().length }} </span>
          @if (isLast()) {
            <button
              type="button"
              (click)="dialogueClosed.emit()"
              class="text-(--color-accent) hover:underline opacity-100 text-xs cursor-pointer flex items-center gap-1"
            >
              <span class="material-icons mi-sm">close</span>
              Close
            </button>
          } @else {
            <span class="text-(--color-text) animate-pulse flex items-center gap-1">
              <span class="material-icons mi-sm">arrow_forward</span>
              Click to continue
            </span>
          }
        </div>
      </div>
    </div>
  `,
})
export class DialogueBoxComponent {
  readonly lines = input.required<DialogueLine[]>();
  readonly dialogueClosed = output<void>();

  readonly currentIndex = signal(0);
  readonly currentLine = computed(() => this.lines()[this.currentIndex()]);
  readonly isLast = computed(() => this.currentIndex() >= this.lines().length - 1);

  advance(): void {
    if (!this.isLast()) {
      this.currentIndex.update((i) => i + 1);
    }
  }
}
