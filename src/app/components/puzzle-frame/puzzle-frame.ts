import { Component, input, output, signal, computed, inject, HostListener } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { PuzzleEvent } from '../../models';

@Component({
  selector: 'app-puzzle-frame',
  standalone: true,
  template: `
    <div
      class="flex flex-col gap-4 rounded border bg-(--color-surface) p-6"
      style="border-color: rgba(201,168,76,0.3);"
    >
      <!-- Header -->
      <div class="flex flex-col gap-1">
        <h2 class="text-(--color-accent) font-serif font-bold text-xl">{{ puzzle().title }}</h2>
        <p class="text-(--color-text) text-sm opacity-70">{{ puzzle().description }}</p>
      </div>

      <!-- Sandboxed puzzle iframe -->
      <div
        class="w-full rounded overflow-hidden border transition-opacity"
        style="border-color: rgba(201,168,76,0.2);"
        [class.opacity-50]="solved()"
      >
        <!-- srcdoc bound to sanitized SafeHtml — iframe is sandboxed allow-scripts only, no allow-same-origin -->
        <iframe
          [srcdoc]="safeSrcdoc()"
          sandbox="allow-scripts"
          class="w-full min-h-100 bg-white border-0"
          title="Puzzle"
        >
        </iframe>
      </div>

      <!-- Solved banner -->
      @if (solved()) {
        <div class="rounded border border-green-600/40 bg-green-900/20 p-4 text-green-400 text-sm">
          ✓ Puzzle solved! Reward clue unlocked.
        </div>
      }

      <!-- Hints -->
      <div class="flex flex-col gap-2">
        @for (hint of shownHints(); track $index) {
          <div
            class="rounded border bg-(--color-secondary) px-4 py-2 text-(--color-text) text-sm italic opacity-70"
            style="border-color: rgba(201,168,76,0.2);"
          >
            Hint {{ $index + 1 }}: {{ hint }}
          </div>
        }
        @if (hasMoreHints() && !solved()) {
          <button
            type="button"
            (click)="showNextHint()"
            class="self-start text-xs text-(--color-accent) hover:underline transition-colors opacity-70 hover:opacity-100 cursor-pointer"
          >
            Need a hint? ({{ puzzle().hints.length - shownHints().length }} remaining)
          </button>
        }
      </div>
    </div>
  `,
})
export class PuzzleFrameComponent {
  readonly puzzle = input.required<PuzzleEvent>();
  readonly puzzleSolved = output<string>();

  readonly solved = signal(false);
  private readonly hintIndex = signal(-1);

  readonly shownHints = computed(() => this.puzzle().hints.slice(0, this.hintIndex() + 1));
  readonly hasMoreHints = computed(() => this.hintIndex() < this.puzzle().hints.length - 1);

  // bypassSecurityTrustHtml is safe here: the iframe uses sandbox="allow-scripts" with no
  // allow-same-origin, so the injected content cannot access parent DOM, cookies, or storage.
  readonly safeSrcdoc = computed(
    (): SafeHtml => this.sanitizer.bypassSecurityTrustHtml(this.puzzle().htmlComponent),
  );

  private readonly sanitizer = inject(DomSanitizer);

  @HostListener('window:message', ['$event'])
  onMessage(event: MessageEvent<{ type?: string; puzzleId?: string }>): void {
    if (
      event.data?.type === 'PUZZLE_SOLVED' &&
      event.data.puzzleId === this.puzzle().id &&
      !this.solved()
    ) {
      this.solved.set(true);
      this.puzzleSolved.emit(this.puzzle().id);
    }
  }

  showNextHint(): void {
    if (this.hasMoreHints()) {
      this.hintIndex.update((i) => i + 1);
    }
  }
}
