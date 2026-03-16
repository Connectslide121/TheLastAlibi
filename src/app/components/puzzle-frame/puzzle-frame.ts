import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { PuzzleEvent, Clue } from '../../models';

@Component({
  selector: 'app-puzzle-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:message)': 'onMessage($event)',
  },
  template: `
    <div
      class="flex flex-col gap-4 rounded border bg-(--color-surface) h-full"
      style="border-color: rgba(201,168,76,0.3);"
      [class.p-6]="!previewOnly()"
      [class.p-4]="previewOnly()"
    >
      <!-- Header -->
      <div class="flex flex-col gap-1 shrink-0">
        <h2 class="text-(--color-accent) font-serif font-bold text-xl">{{ puzzle().title }}</h2>
        <p class="text-(--color-text) text-sm opacity-70">{{ puzzle().description }}</p>
      </div>

      <!-- Reward clue preview (blurred until solved) -->
      @if (rewardClue() && !previewOnly()) {
        <div
          class="flex items-center gap-3 p-3 rounded border transition-all duration-700 shrink-0"
          style="border-color: rgba(201,168,76,0.2); background: var(--color-secondary);"
          [class.blur-sm]="!solved()"
          [class.opacity-50]="!solved()"
        >
          <span class="material-icons mi-lg text-(--color-accent)">{{
            solved() ? 'manage_search' : 'lock'
          }}</span>
          <div class="flex-1 min-w-0">
            <p class="font-heading text-sm text-(--color-accent) truncate">
              {{ solved() ? rewardClue()!.name : 'Reward Clue — Solve to unlock' }}
            </p>
            @if (solved()) {
              <p class="text-xs text-(--color-text) mt-0.5 opacity-80">
                {{ rewardClue()!.description }}
              </p>
            }
          </div>
        </div>
      }

      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] flex-1 min-h-0">
        <!-- Iframe: main panel -->
        <div
          class="rounded overflow-hidden border transition-opacity min-h-112 lg:min-h-0"
          style="border-color: rgba(201,168,76,0.2);"
          [class.opacity-40]="solved()"
        >
          <!-- srcdoc bound to sanitized SafeHtml — iframe is sandboxed allow-scripts only, no allow-same-origin -->
          <iframe
            [srcdoc]="safeSrcdoc()"
            sandbox="allow-scripts"
            class="w-full h-full border-0 bg-white"
            title="Puzzle exhibit"
          >
          </iframe>
        </div>

        <!-- Controls: sidebar -->
        <div class="flex flex-col gap-4 min-h-0 overflow-y-auto">
          <div
            class="rounded border p-4 flex flex-col gap-3 shrink-0"
            style="border-color: rgba(201,168,76,0.2); background: var(--color-secondary);"
          >
            <div>
              <p
                class="font-mono text-[10px] uppercase tracking-widest"
                style="color: var(--color-accent)"
              >
                Investigation Notes
              </p>
              <p class="text-sm mt-1" style="color: var(--color-text)">
                {{ displayInstructions() }}
              </p>
            </div>

            <div>
              <p
                class="font-mono text-[10px] uppercase tracking-widest"
                style="color: var(--color-text-muted)"
              >
                Expected Format
              </p>
              <p class="text-sm mt-1" style="color: var(--color-text)">
                {{ displayAnswerFormat() }}
              </p>
            </div>
          </div>

          <div
            class="rounded border p-4 flex flex-col gap-3 shrink-0"
            style="border-color: rgba(201,168,76,0.2); background: var(--color-secondary);"
          >
            <p
              class="font-mono text-[10px] uppercase tracking-widest"
              style="color: var(--color-accent)"
            >
              Visible Clues
            </p>
            <ul class="flex flex-col gap-2 list-disc pl-5">
              @for (clue of displayVisibleClues(); track $index) {
                <li class="text-sm" style="color: var(--color-text)">{{ clue }}</li>
              }
            </ul>
          </div>

          <div
            class="rounded border p-4 flex flex-col gap-3 shrink-0"
            style="border-color: rgba(201,168,76,0.2); background: var(--color-secondary);"
          >
            <div>
              <p
                class="font-mono text-[10px] uppercase tracking-widest"
                style="color: var(--color-accent)"
              >
                {{ displayAnswerPrompt() }}
              </p>
              <p class="text-xs mt-1" style="color: var(--color-text-muted)">
                Submit your answer here. The interactive exhibit can help, but it is not required.
              </p>
            </div>

            @if (!solved()) {
              <div class="flex flex-col gap-2">
                <input
                  type="text"
                  [value]="answer()"
                  [placeholder]="displayAnswerPlaceholder()"
                  (input)="onAnswerInput($event)"
                  class="w-full rounded px-3 py-2 text-sm outline-none"
                  style="background: rgba(0,0,0,0.2); border: 1px solid rgba(201,168,76,0.2); color: var(--color-text)"
                  aria-label="Puzzle answer"
                />
                <button
                  type="button"
                  (click)="submitAnswer()"
                  class="w-full px-4 py-2 rounded font-mono text-xs uppercase tracking-widest cursor-pointer transition-opacity hover:opacity-85 disabled:opacity-40"
                  style="background: rgba(201,168,76,0.14); color: var(--color-accent); border: 1px solid rgba(201,168,76,0.28)"
                  [disabled]="!canSubmit()"
                >
                  Submit Answer
                </button>
              </div>
            } @else {
              <p class="text-sm" style="color: rgb(134,239,172)">
                Solved with answer: {{ answer() || puzzle().solutionCondition }}
              </p>
            }

            @if (invalidAttempt()) {
              <p class="text-sm" style="color: rgb(252,165,165)">
                That answer does not fit the clues yet. Recheck the visible evidence and try again.
              </p>
            }
          </div>
        </div>
      </div>

      <!-- Solved banner with animation -->
      @if (solved()) {
        <div
          class="rounded border border-green-600/40 bg-green-900/20 p-4 text-green-400 text-sm flex items-center gap-2"
        >
          <span class="material-icons mi-md">task_alt</span>
          <span
            >Puzzle solved!{{
              rewardClue()
                ? ' "' + rewardClue()!.name + '" has been added to your evidence.'
                : ' Reward unlocked.'
            }}</span
          >
        </div>
      }

      <!-- Hints -->
      @if (!previewOnly()) {
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
              class="self-start text-xs text-(--color-accent) hover:underline transition-colors opacity-70 hover:opacity-100 cursor-pointer flex items-center gap-1"
            >
              <span class="material-icons mi-sm">help_outline</span>
              Need a hint? ({{ puzzle().hints.length - shownHints().length }} remaining)
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class PuzzleFrameComponent {
  readonly puzzle = input.required<PuzzleEvent>();
  /** Optional: pass the actual Clue object for the reward preview. */
  readonly rewardClue = input<Clue | null>(null);
  readonly previewOnly = input(false);
  readonly puzzleSolved = output<string>();

  readonly solved = signal(false);
  readonly answer = signal('');
  readonly invalidAttempt = signal(false);
  private readonly hintIndex = signal(-1);

  readonly shownHints = computed(() => this.puzzle().hints.slice(0, this.hintIndex() + 1));
  readonly hasMoreHints = computed(() => this.hintIndex() < this.puzzle().hints.length - 1);
  readonly canSubmit = computed(() => this.answer().trim().length > 0 && !this.solved());
  readonly displayInstructions = computed(
    () => this.puzzle().interactionInstructions ?? this.puzzle().description,
  );
  readonly displayVisibleClues = computed(() => {
    const structured = this.puzzle().visibleClues ?? [];
    return structured.length > 0
      ? structured
      : ['No structured clue list was stored for this puzzle. Use the exhibit and hints.'];
  });
  readonly displayAnswerPrompt = computed(() => this.puzzle().answerPrompt ?? 'Submit your answer');
  readonly displayAnswerPlaceholder = computed(
    () => this.puzzle().answerPlaceholder ?? 'Enter the answer exactly as the clues imply',
  );
  readonly displayAnswerFormat = computed(
    () => this.puzzle().answerFormat ?? this.puzzle().solutionCondition,
  );
  readonly displayAcceptableAnswers = computed(() => {
    const answers = this.puzzle().acceptableAnswers ?? [];
    return answers.length > 0 ? answers : [this.puzzle().solutionCondition];
  });
  readonly normalizedAcceptableAnswers = computed(() => {
    const normalized = this.displayAcceptableAnswers()
      .map((answer) => this.normalizeAnswer(answer))
      .filter((answer) => answer.length > 0);
    return [...new Set(normalized)];
  });

  // bypassSecurityTrustHtml is safe here: the iframe uses sandbox="allow-scripts" with no
  // allow-same-origin, so the injected content cannot access parent DOM, cookies, or storage.
  readonly safeSrcdoc = computed(
    (): SafeHtml => this.sanitizer.bypassSecurityTrustHtml(this.puzzle().htmlComponent),
  );

  private readonly sanitizer = inject(DomSanitizer);

  constructor() {
    effect(() => {
      const p = this.puzzle();
      this.solved.set(false);
      this.answer.set('');
      this.invalidAttempt.set(false);
      this.hintIndex.set(-1);
      console.group(`[PuzzleFrame] "${p.title}" (id: ${p.id})`);
      console.log('htmlComponent length:', p.htmlComponent?.length ?? 0);
      console.log('htmlComponent preview (first 500 chars):', p.htmlComponent?.slice(0, 500));
      console.log('full htmlComponent:', p.htmlComponent);
      console.groupEnd();
    });
  }

  onMessage(event: MessageEvent<{ type?: string; puzzleId?: string }>): void {
    if (
      event.data?.type === 'PUZZLE_SOLVED' &&
      event.data.puzzleId === this.puzzle().id &&
      !this.solved()
    ) {
      this.markSolved();
    }
  }

  onAnswerInput(event: Event): void {
    this.answer.set((event.target as HTMLInputElement).value);
    this.invalidAttempt.set(false);
  }

  submitAnswer(): void {
    if (!this.canSubmit()) return;

    const normalizedAnswer = this.normalizeAnswer(this.answer());
    if (this.normalizedAcceptableAnswers().includes(normalizedAnswer)) {
      this.markSolved();
      return;
    }

    this.invalidAttempt.set(true);
  }

  showNextHint(): void {
    if (this.hasMoreHints()) {
      this.hintIndex.update((i) => i + 1);
    }
  }

  private markSolved(): void {
    if (this.solved()) return;
    this.solved.set(true);
    this.invalidAttempt.set(false);
    this.puzzleSolved.emit(this.puzzle().rewardedClueId);
  }

  private normalizeAnswer(value: string): string {
    return value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
