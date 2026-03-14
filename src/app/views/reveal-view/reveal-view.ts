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
          <h1
            class="font-heading text-4xl mb-3"
            [style.color]="isCorrect() ? 'rgb(134,239,172)' : 'rgb(252,165,165)'"
          >
            {{ isCorrect() ? 'Brilliant Deduction!' : 'Not Quite…' }}
          </h1>
          <p class="text-(--color-text) max-w-lg mx-auto">
            @if (isCorrect()) {
              You correctly identified <strong>{{ culprit()?.name }}</strong> as the culprit.
            } @else {
              You accused <strong>{{ accusedSuspect()?.name }}</strong
              >, but the truth is more complicated.
            }
          </p>
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
                🧑
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
            <h2 class="font-heading text-xl text-(--color-accent) mb-4">Step by Step</h2>
            <div class="flex flex-col gap-3">
              @for (step of visibleSteps(); track $index) {
                <div
                  class="flex gap-3 p-4 rounded-lg"
                  style="background: var(--color-secondary); border: var(--border-style);"
                >
                  <span class="font-mono text-sm text-(--color-accent) shrink-0 w-6 text-center">
                    {{ $index + 1 }}.
                  </span>
                  <p class="text-sm text-(--color-text)">{{ step }}</p>
                </div>
              }
            </div>
            @if (currentStep() < totalSteps() - 1) {
              <button
                type="button"
                (click)="nextStep()"
                class="mt-4 px-6 py-2.5 rounded border font-mono uppercase tracking-widest text-sm cursor-pointer hover:opacity-80 transition-opacity"
                style="border-color: var(--color-accent); color: var(--color-accent);"
              >
                Next →
              </button>
            }
          </section>
        }

        <!-- Red Herrings -->
        @if (
          showRedHerrings() && casePackage()?.solutionExplanation?.redHerringExplanations?.length
        ) {
          <section class="px-6 pb-6 max-w-3xl mx-auto w-full">
            <h2 class="font-heading text-xl text-(--color-accent) mb-3">About the Red Herrings</h2>
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
              class="text-sm font-mono text-(--color-text-muted) underline cursor-pointer hover:opacity-80"
            >
              Show red herring explanations
            </button>
          </div>
        }

        <!-- Timeline Reveal -->
        @if (currentStep() >= totalSteps() - 1) {
          <section class="px-6 pb-6 max-w-3xl mx-auto w-full">
            <h2 class="font-heading text-xl text-(--color-accent) mb-4">The Real Timeline</h2>
            <app-timeline [events]="casePackage()!.timeline" [revealTruth]="true" />
          </section>

          <!-- All Clues with Truth -->
          <section class="px-6 pb-6 max-w-3xl mx-auto w-full">
            <h2 class="font-heading text-xl text-(--color-accent) mb-4">All Evidence Reviewed</h2>
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
              class="px-10 py-3 rounded-lg border font-mono uppercase tracking-widest text-sm cursor-pointer hover:opacity-80 transition-opacity"
              style="border-color: var(--color-accent); color: var(--color-accent);"
            >
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
