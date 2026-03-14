import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CaseStoreService } from '../../services/case-store.service';
import { GameStateService } from '../../services/game-state.service';
import { ThemeService } from '../../services/theme.service';
import { TimelineComponent, ClueCardComponent } from '../../components';
import { CasePackage, Suspect, Clue } from '../../models';

@Component({
  selector: 'app-reveal-view',
  standalone: true,
  imports: [TimelineComponent, ClueCardComponent],
  template: `
    <div class="min-h-screen bg-(--color-primary) flex flex-col">
      @if (isLoading()) {
        <div class="flex-1 flex items-center justify-center">
          <p class="text-(--color-text-muted) animate-pulse font-mono">Unveiling the truth…</p>
        </div>
      } @else {
        <!-- Verdict Banner -->
        <div
          class="px-6 py-8 text-center"
          [style.background]="isCorrect() ? 'rgba(20,83,45,0.4)' : 'rgba(127,29,29,0.4)'"
          [style.border-bottom]="
            isCorrect() ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(239,68,68,0.4)'
          "
        >
          <p
            class="font-mono text-xs uppercase tracking-widest mb-2 opacity-60"
            [style.color]="isCorrect() ? 'rgb(134,239,172)' : 'rgb(252,165,165)'"
          >
            {{ isCorrect() ? 'Case Solved' : 'Wrong Accusation' }}
          </p>
          <div class="flex items-center justify-center gap-3 mb-2">
            <span
              class="material-icons text-5xl"
              [style.color]="isCorrect() ? 'rgb(134,239,172)' : 'rgb(252,165,165)'"
              >{{ isCorrect() ? 'emoji_events' : 'error' }}</span
            >
            <h1
              class="font-heading text-4xl"
              [style.color]="isCorrect() ? 'rgb(134,239,172)' : 'rgb(252,165,165)'"
            >
              {{ isCorrect() ? 'Brilliant Deduction!' : 'Not Quite…' }}
            </h1>
          </div>
          <p class="text-(--color-text) max-w-lg mx-auto">
            @if (isCorrect()) {
              You correctly identified <strong>{{ culprit()?.name }}</strong> as the culprit.
            } @else {
              You accused <strong>{{ accusedSuspect()?.name }}</strong
              >, but the truth is more complicated.
            }
          </p>

          <!-- Score & Grade -->
          <div class="flex items-center justify-center gap-6 mt-6">
            <div class="flex flex-col items-center gap-1">
              <div class="flex items-center gap-1">
                <span class="material-icons mi-sm opacity-60" [style.color]="grade().colour"
                  >military_tech</span
                >
                <span
                  class="font-heading text-6xl font-bold leading-none"
                  [style.color]="grade().colour"
                  >{{ grade().letter }}</span
                >
              </div>
              <span
                class="font-mono text-xs uppercase tracking-widest opacity-60"
                [style.color]="grade().colour"
              >
                {{ grade().label }}
              </span>
            </div>
            <div class="w-px h-12 opacity-20" style="background: currentColor;"></div>
            <div class="flex flex-col items-center gap-1">
              <span class="font-heading text-4xl font-bold text-(--color-accent)">{{
                score()
              }}</span>
              <span class="font-mono text-xs uppercase tracking-widest text-(--color-text-muted)"
                >points</span
              >
            </div>
          </div>

          <!-- Score breakdown -->
          <div
            class="mt-3 font-mono text-xs text-(--color-text-muted) flex flex-wrap gap-x-5 gap-y-1 justify-center"
          >
            <span>Base: 1000</span>
            @if (gameState()?.hintsUsed) {
              <span>Hints: −{{ (gameState()?.hintsUsed ?? 0) * 50 }}</span>
            }
            @if (!isCorrect()) {
              <span>Wrong accusation: −100</span>
            }
            @if ((gameState()?.interviewedSuspectIds?.length ?? 0) > 1) {
              <span
                >Extra interviews: −{{
                  ((gameState()?.interviewedSuspectIds?.length ?? 1) - 1) * 10
                }}</span
              >
            }
          </div>
        </div>

        <!-- Culprit Reveal -->
        <section class="px-6 py-8 max-w-3xl mx-auto w-full">
          <div
            class="flex items-start gap-6 p-6 rounded-xl"
            style="background: var(--color-secondary); border: var(--border-style);"
          >
            @if (culprit()?.imageUrl) {
              <img
                [src]="culprit()!.imageUrl"
                [alt]="culprit()!.name"
                class="w-24 h-24 rounded-full object-cover shrink-0"
              />
            } @else {
              <div
                class="w-24 h-24 rounded-full flex items-center justify-center text-4xl bg-(--color-surface) shrink-0"
              >
                <span class="material-icons mi-2xl text-(--color-text-muted)">person</span>
              </div>
            }
            <div>
              <p class="font-mono text-xs uppercase tracking-widest text-(--color-text-muted) mb-1">
                The Culprit
              </p>
              <h2 class="font-heading text-2xl text-(--color-accent) mb-0.5">
                {{ culprit()?.name }}
              </h2>
              <p class="text-sm text-(--color-text-muted) mb-2">{{ culprit()?.occupation }}</p>
              <p class="text-sm text-(--color-text)">
                <strong>Motive:</strong> {{ casePackage()?.truth?.motive }}
              </p>
              <p class="text-sm text-(--color-text) mt-1">
                <strong>Method:</strong> {{ casePackage()?.truth?.method }}
              </p>
            </div>
          </div>
        </section>

        <!-- Narrative -->
        <section class="px-6 pb-6 max-w-3xl mx-auto w-full">
          <h2 class="font-heading text-xl text-(--color-accent) mb-4">The Full Story</h2>
          <p class="text-(--color-text) leading-relaxed font-body whitespace-pre-line">
            {{ casePackage()?.solutionExplanation?.narrative }}
          </p>
        </section>

        <!-- Steps Explained -->
        @if (casePackage()?.solutionExplanation?.stepsExplained?.length) {
          <section class="px-6 pb-6 max-w-3xl mx-auto w-full">
            <h2 class="font-heading text-xl text-(--color-accent) mb-4 flex items-center gap-2">
              <span class="material-icons mi-lg">format_list_numbered</span>
              Step by Step
            </h2>
            <div class="flex flex-col gap-3">
              @for (step of visibleSteps(); track $index) {
                <div
                  class="flex gap-3 p-4 rounded-lg"
                  style="background: var(--color-secondary); border: var(--border-style);"
                >
                  <span class="material-icons mi-sm text-(--color-accent) shrink-0 mt-0.5"
                    >check_circle</span
                  >
                  <p class="text-sm text-(--color-text)">{{ step }}</p>
                </div>
              }
            </div>
            @if (currentStep() < totalSteps() - 1) {
              <button
                type="button"
                (click)="nextStep()"
                class="mt-4 px-6 py-2.5 rounded border font-mono uppercase tracking-widest text-sm cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-2"
                style="border-color: var(--color-accent); color: var(--color-accent);"
              >
                <span class="material-icons mi-sm">navigate_next</span>
                Next
              </button>
            }
          </section>
        }

        <!-- Red Herrings -->
        @if (
          showRedHerrings() && casePackage()?.solutionExplanation?.redHerringExplanations?.length
        ) {
          <section class="px-6 pb-6 max-w-3xl mx-auto w-full">
            <h2 class="font-heading text-xl text-(--color-accent) mb-3 flex items-center gap-2">
              <span class="material-icons mi-lg">warning</span>
              About the Red Herrings
            </h2>
            <div class="flex flex-col gap-2">
              @for (
                exp of casePackage()!.solutionExplanation.redHerringExplanations;
                track $index
              ) {
                <p
                  class="text-sm text-(--color-text) p-4 rounded-lg"
                  style="background: var(--color-secondary); border: 1px solid rgba(201,168,76,0.15);"
                >
                  {{ exp }}
                </p>
              }
            </div>
          </section>
        }

        @if (!showRedHerrings() && currentStep() >= totalSteps() - 1) {
          <div class="px-6 pb-2 max-w-3xl mx-auto w-full">
            <button
              type="button"
              (click)="showRedHerrings.set(true)"
              class="text-sm font-mono text-(--color-text-muted) underline cursor-pointer hover:opacity-80 flex items-center gap-1"
            >
              <span class="material-icons mi-sm">expand_more</span>
              Show red herring explanations
            </button>
          </div>
        }

        <!-- Timeline Reveal -->
        @if (currentStep() >= totalSteps() - 1) {
          <section class="px-6 pb-6 max-w-3xl mx-auto w-full">
            <h2 class="font-heading text-xl text-(--color-accent) mb-4 flex items-center gap-2">
              <span class="material-icons mi-lg">timeline</span>
              The Real Timeline
            </h2>
            <app-timeline [events]="casePackage()!.timeline" [revealTruth]="true" />
          </section>

          <!-- All Clues with Truth -->
          <section class="px-6 pb-6 max-w-3xl mx-auto w-full">
            <h2 class="font-heading text-xl text-(--color-accent) mb-4 flex items-center gap-2">
              <span class="material-icons mi-lg">article</span>
              All Evidence Reviewed
            </h2>
            <div class="flex flex-col gap-3">
              @for (clue of allClues(); track clue.id) {
                <app-clue-card [clue]="clue" [showTruth]="true" />
              }
            </div>
          </section>

          <!-- Play Again -->
          <div class="px-6 pb-12 max-w-3xl mx-auto w-full text-center">
            <button
              type="button"
              (click)="playAgain()"
              class="px-10 py-3 rounded-lg border font-mono uppercase tracking-widest text-sm cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-2"
              style="border-color: var(--color-accent); color: var(--color-accent);"
            >
              <span class="material-icons mi-sm">replay</span>
              Play Again
            </button>
          </div>
        }
      }
    </div>
  `,
})
export class RevealView implements OnInit {
  private readonly router = inject(Router);
  private readonly caseStore = inject(CaseStoreService);
  private readonly gsvc = inject(GameStateService);
  private readonly theme = inject(ThemeService);

  readonly isLoading = signal(true);
  readonly casePackage = signal<CasePackage | null>(null);
  readonly currentStep = signal(0);
  readonly showRedHerrings = signal(false);

  readonly gameState = this.gsvc.state;

  readonly isCorrect = computed((): boolean => {
    const pkg = this.casePackage();
    const accusation = this.gameState()?.finalAccusation;
    if (!pkg || !accusation) return false;
    return (
      accusation.culpritId === pkg.truth.culpritId &&
      accusation.method.trim().toLowerCase() === pkg.truth.method.trim().toLowerCase()
    );
  });

  readonly culprit = computed((): Suspect | undefined => {
    const pkg = this.casePackage();
    if (!pkg) return undefined;
    return pkg.suspects.find((s) => s.id === pkg.truth.culpritId);
  });

  readonly accusedSuspect = computed((): Suspect | undefined => {
    const pkg = this.casePackage();
    const accusation = this.gameState()?.finalAccusation;
    if (!pkg || !accusation) return undefined;
    return pkg.suspects.find((s) => s.id === accusation.culpritId);
  });

  readonly allClues = computed((): Clue[] => {
    return this.casePackage()?.clues ?? [];
  });

  readonly totalSteps = computed((): number => {
    return this.casePackage()?.solutionExplanation.stepsExplained.length ?? 0;
  });

  readonly visibleSteps = computed((): string[] => {
    const steps = this.casePackage()?.solutionExplanation.stepsExplained ?? [];
    return steps.slice(0, this.currentStep() + 1);
  });

  readonly score = computed((): number => {
    const pkg = this.casePackage();
    const state = this.gameState();
    if (!pkg || !state) return 0;

    let points = 1000;

    // Deduct for hints
    points -= state.hintsUsed * 50;

    // Deduct 100 for wrong accusation
    if (!this.isCorrect()) points -= 100;

    // Deduct 10 per suspect interviewed beyond the culprit alone
    const excessInterviews = Math.max(0, state.interviewedSuspectIds.length - 1);
    points -= excessInterviews * 10;

    // Bonus 200 if all red-herring clues were found
    const redHerringIds = pkg.truth.redHerringClueIds;
    if (redHerringIds.length > 0 && redHerringIds.every((id) => state.foundClueIds.includes(id))) {
      points += 200;
    }

    return Math.max(0, points);
  });

  readonly grade = computed((): { letter: string; colour: string; label: string } => {
    const s = this.score();
    if (s >= 900) return { letter: 'S', colour: 'rgb(250,204,21)', label: 'Master Detective' };
    if (s >= 750) return { letter: 'A', colour: 'rgb(134,239,172)', label: 'Excellent Work' };
    if (s >= 600) return { letter: 'B', colour: 'rgb(147,197,253)', label: 'Good Investigation' };
    if (s >= 400) return { letter: 'C', colour: 'rgb(253,186,116)', label: 'Adequate' };
    return { letter: 'F', colour: 'rgb(252,165,165)', label: 'Back to the Academy' };
  });

  ngOnInit(): void {
    const sessionId = this.gsvc.state()?.sessionId;
    if (!sessionId) {
      void this.router.navigate(['/']);
      return;
    }
    this.caseStore.loadCase(sessionId).subscribe((pkg) => {
      if (!pkg) {
        void this.router.navigate(['/']);
        return;
      }
      this.casePackage.set(pkg);
      this.theme.applyTheme(pkg.uiTheme);
      this.isLoading.set(false);
    });
  }

  nextStep(): void {
    const total = this.totalSteps();
    if (this.currentStep() < total - 1) {
      this.currentStep.update((s) => s + 1);
    }
  }

  playAgain(): void {
    this.gsvc.clearState();
    this.theme.resetTheme();
    void this.router.navigate(['/']);
  }
}
