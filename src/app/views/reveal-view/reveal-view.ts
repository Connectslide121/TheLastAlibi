import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CaseStoreService } from '../../services/case-store.service';
import { GameStateService } from '../../services/game-state.service';
import { ImageService } from '../../services/image.service';
import { ThemeService } from '../../services/theme.service';
import { TimelineComponent, ClueCardComponent, SuspectCardComponent } from '../../components';
import { CasePackage, Suspect, Clue } from '../../models';

@Component({
  selector: 'app-reveal-view',
  standalone: true,
  imports: [TimelineComponent, ClueCardComponent, SuspectCardComponent],
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
            @if (isCulpritCorrect()) {
              @if (isMethodMatched()) {
                You correctly identified <strong>{{ culprit()?.name }}</strong> as the culprit.
              } @else {
                You identified <strong>{{ culprit()?.name }}</strong> as the culprit, even if some
                details of the method were off.
              }
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
            @if (!isCulpritCorrect()) {
              <span>Wrong accusation: −300</span>
            } @else if (!isMethodMatched()) {
              <span>Method mismatch: −75</span>
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

        <div class="px-6 py-8 max-w-7xl mx-auto w-full">
          <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-8 items-start">
            <div class="min-w-0 flex flex-col gap-6">
              <section class="max-w-3xl w-full">
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
                    <p
                      class="font-mono text-xs uppercase tracking-widest text-(--color-text-muted) mb-1"
                    >
                      The Culprit
                    </p>
                    <h2 class="font-heading text-2xl text-(--color-accent) mb-0.5">
                      {{ culprit()?.name }}
                    </h2>
                    <p class="text-sm text-(--color-text-muted) mb-2">
                      {{ culprit()?.occupation }}
                    </p>
                    <p class="text-sm text-(--color-text)">
                      <strong>Motive:</strong> {{ casePackage()?.truth?.motive }}
                    </p>
                    <p class="text-sm text-(--color-text) mt-1">
                      <strong>Method:</strong> {{ casePackage()?.truth?.method }}
                    </p>
                  </div>
                </div>
              </section>

              <section class="max-w-3xl w-full">
                <h2 class="font-heading text-xl text-(--color-accent) mb-4">The Full Story</h2>
                <p class="text-(--color-text) leading-relaxed font-body whitespace-pre-line">
                  {{ casePackage()?.solutionExplanation?.narrative }}
                </p>
              </section>

              @if (casePackage()?.solutionExplanation?.stepsExplained?.length) {
                <section class="max-w-3xl w-full">
                  <h2
                    class="font-heading text-xl text-(--color-accent) mb-4 flex items-center gap-2"
                  >
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
                </section>
              }

              @if (casePackage()?.solutionExplanation?.redHerringExplanations?.length) {
                <section class="max-w-3xl w-full">
                  <h2
                    class="font-heading text-xl text-(--color-accent) mb-3 flex items-center gap-2"
                  >
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

              @if (casePackage()) {
                <section class="max-w-3xl w-full">
                  <h2
                    class="font-heading text-xl text-(--color-accent) mb-4 flex items-center gap-2"
                  >
                    <span class="material-icons mi-lg">timeline</span>
                    The Real Timeline
                  </h2>
                  <app-timeline [events]="casePackage()!.timeline" [revealTruth]="true" />
                </section>

                <section class="w-full">
                  <h2
                    class="font-heading text-xl text-(--color-accent) mb-4 flex items-center gap-2"
                  >
                    <span class="material-icons mi-lg">group</span>
                    All Suspects Reviewed
                  </h2>
                  <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    @for (suspect of allSuspects(); track suspect.id) {
                      <app-suspect-card
                        [suspect]="suspect"
                        [isInterviewed]="
                          (gameState()?.interviewedSuspectIds ?? []).includes(suspect.id)
                        "
                        [variant]="'compact'"
                        (cardClicked)="expandedSuspect.set($event)"
                      />
                    }
                  </div>
                </section>

                <section class="w-full">
                  <h2
                    class="font-heading text-xl text-(--color-accent) mb-4 flex items-center gap-2"
                  >
                    <span class="material-icons mi-lg">article</span>
                    All Evidence Reviewed
                  </h2>
                  <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    @for (clue of allClues(); track clue.id) {
                      <button
                        type="button"
                        class="text-left cursor-pointer hover:opacity-90 transition-opacity"
                        (click)="expandedClue.set(clue)"
                      >
                        <app-clue-card [clue]="clue" [showTruth]="true" [variant]="'compact'" />
                      </button>
                    }
                  </div>
                </section>

                <div class="max-w-3xl w-full text-center xl:text-left">
                  <div class="flex flex-wrap items-center justify-center xl:justify-start gap-3">
                    <button
                      type="button"
                      (click)="playAgain()"
                      class="px-10 py-3 rounded-lg border font-mono uppercase tracking-widest text-sm cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-2"
                      style="border-color: var(--color-accent); color: var(--color-accent);"
                    >
                      <span class="material-icons mi-sm">replay</span>
                      Play Again
                    </button>
                    <button
                      type="button"
                      (click)="goHome()"
                      class="px-10 py-3 rounded-lg border font-mono uppercase tracking-widest text-sm cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-2"
                      style="border-color: rgba(201,168,76,0.35); color: var(--color-text-muted);"
                    >
                      <span class="material-icons mi-sm">home</span>
                      Back Home
                    </button>
                  </div>
                </div>
              }
            </div>

            <aside class="min-w-0 xl:sticky xl:top-6">
              <section
                class="rounded-xl p-5 flex flex-col gap-4"
                style="background: var(--color-secondary); border: var(--border-style); box-shadow: var(--shadow-style);"
              >
                <div class="flex items-center gap-2">
                  <span class="material-icons mi-lg" style="color: var(--color-accent)"
                    >fact_check</span
                  >
                  <h2 class="font-heading text-lg" style="color: var(--color-accent)">
                    Your Accusation
                  </h2>
                </div>

                @if (accusedSuspect()) {
                  <app-suspect-card
                    [suspect]="accusedSuspect()!"
                    [isInterviewed]="
                      (gameState()?.interviewedSuspectIds ?? []).includes(accusedSuspect()!.id)
                    "
                    [variant]="'compact'"
                    (cardClicked)="expandedSuspect.set($event)"
                  />
                } @else {
                  <div
                    class="rounded-lg p-4 text-sm"
                    style="background: var(--color-surface); border: var(--border-style); color: var(--color-text-muted)"
                  >
                    No suspect was recorded in your final accusation.
                  </div>
                }

                <div class="flex flex-col gap-3">
                  <div
                    class="rounded-lg p-4"
                    style="background: var(--color-surface); border: var(--border-style)"
                  >
                    <p
                      class="font-mono text-xs uppercase tracking-widest mb-2"
                      style="color: var(--color-accent)"
                    >
                      Method Check
                    </p>
                    <p class="text-sm leading-relaxed" style="color: var(--color-text)">
                      {{
                        isMethodMatched()
                          ? 'Close enough to the true method.'
                          : 'Method details did not fully match.'
                      }}
                    </p>
                  </div>

                  <div
                    class="rounded-lg p-4"
                    style="background: var(--color-surface); border: var(--border-style)"
                  >
                    <p
                      class="font-mono text-xs uppercase tracking-widest mb-2"
                      style="color: var(--color-accent)"
                    >
                      Submitted Motive
                    </p>
                    <p
                      class="text-sm leading-relaxed whitespace-pre-line"
                      style="color: var(--color-text)"
                    >
                      {{ submittedMotive() || 'No motive submitted.' }}
                    </p>
                  </div>

                  <div
                    class="rounded-lg p-4"
                    style="background: var(--color-surface); border: var(--border-style)"
                  >
                    <p
                      class="font-mono text-xs uppercase tracking-widest mb-2"
                      style="color: var(--color-accent)"
                    >
                      Submitted Method
                    </p>
                    <p
                      class="text-sm leading-relaxed whitespace-pre-line"
                      style="color: var(--color-text)"
                    >
                      {{ submittedMethod() || 'No method submitted.' }}
                    </p>
                  </div>
                </div>

                <div class="flex flex-col gap-3">
                  <h3
                    class="font-mono text-xs uppercase tracking-widest"
                    style="color: var(--color-text-muted)"
                  >
                    Chosen Evidence
                  </h3>
                  @if (accusedEvidence().length === 0) {
                    <div
                      class="rounded-lg p-4 text-sm"
                      style="background: var(--color-surface); border: var(--border-style); color: var(--color-text-muted)"
                    >
                      No supporting evidence was selected.
                    </div>
                  } @else {
                    <div class="grid grid-cols-1 gap-3">
                      @for (clue of accusedEvidence(); track clue.id) {
                        <button
                          type="button"
                          class="text-left cursor-pointer hover:opacity-90 transition-opacity"
                          (click)="expandedClue.set(clue)"
                        >
                          <app-clue-card [clue]="clue" [showTruth]="true" [variant]="'compact'" />
                        </button>
                      }
                    </div>
                  }
                </div>
              </section>
            </aside>
          </div>
        </div>

        @if (expandedSuspect()) {
          <div
            class="fixed inset-0 z-80 flex items-center justify-center p-4"
            style="background: rgba(0,0,0,0.85)"
            (click)="expandedSuspect.set(null)"
          >
            <div
              class="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg flex flex-col"
              style="background: var(--color-secondary); border: var(--border-style); animation: fadeIn 0.2s ease both"
              (click)="$event.stopPropagation()"
            >
              <button
                type="button"
                (click)="expandedSuspect.set(null)"
                class="absolute top-3 right-3 z-10 p-1.5 rounded-full opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
                style="background: var(--color-surface)"
              >
                <span class="material-icons mi-md" style="color: var(--color-text)">close</span>
              </button>
              <div
                class="w-full overflow-hidden rounded-t-lg"
                style="aspect-ratio: 4/3; background: var(--color-surface)"
              >
                @if (expandedSuspect()!.imageUrl) {
                  <img
                    [src]="expandedSuspect()!.imageUrl"
                    [alt]="expandedSuspect()!.name"
                    class="w-full h-full object-cover"
                  />
                } @else {
                  <div class="w-full h-full flex items-center justify-center opacity-20">
                    <span class="material-icons" style="font-size: 5rem; color: var(--color-text)">
                      person
                    </span>
                  </div>
                }
              </div>
              <div class="p-6 flex flex-col gap-4">
                <div class="flex flex-col gap-1">
                  <h2 class="font-heading text-2xl" style="color: var(--color-accent)">
                    {{ expandedSuspect()!.name }}
                  </h2>
                  <p class="font-mono text-sm" style="color: var(--color-text-muted)">
                    {{ expandedSuspect()!.age }} · {{ expandedSuspect()!.occupation }}
                  </p>
                  <p class="font-mono text-xs mt-0.5" style="color: var(--color-text-muted)">
                    {{ expandedSuspect()!.relationship }}
                  </p>
                </div>
                <p
                  class="text-sm leading-relaxed"
                  style="font-family: var(--font-body); color: var(--color-text)"
                >
                  {{ expandedSuspect()!.description }}
                </p>
                <div
                  class="rounded p-4 flex flex-col gap-2"
                  style="background: var(--color-surface); border: var(--border-style)"
                >
                  <span
                    class="font-mono text-xs uppercase tracking-widest"
                    style="color: var(--color-accent)"
                  >
                    Personality
                  </span>
                  <p
                    class="text-sm leading-relaxed"
                    style="font-family: var(--font-body); color: var(--color-text)"
                  >
                    {{ expandedSuspect()!.personality }}
                  </p>
                </div>
                @if ((gameState()?.interviewedSuspectIds ?? []).includes(expandedSuspect()!.id)) {
                  <div
                    class="rounded p-4 flex flex-col gap-2"
                    style="background: var(--color-surface); border: var(--border-style)"
                  >
                    <span
                      class="font-mono text-xs uppercase tracking-widest"
                      style="color: var(--color-accent)"
                    >
                      Stated Alibi
                    </span>
                    <p
                      class="text-sm leading-relaxed"
                      style="font-family: var(--font-body); color: var(--color-text)"
                    >
                      {{ expandedSuspect()!.alibi }}
                    </p>
                  </div>
                }
              </div>
            </div>
          </div>
        }

        @if (expandedClue()) {
          <div
            class="fixed inset-0 z-80 flex items-center justify-center p-4"
            style="background: rgba(0,0,0,0.85)"
            (click)="expandedClue.set(null)"
          >
            <div
              class="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg flex flex-col"
              style="background: var(--color-secondary); border: var(--border-style); animation: fadeIn 0.2s ease both"
              (click)="$event.stopPropagation()"
            >
              <button
                type="button"
                (click)="expandedClue.set(null)"
                class="absolute top-3 right-3 z-10 p-1.5 rounded-full opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
                style="background: var(--color-surface)"
              >
                <span class="material-icons mi-md" style="color: var(--color-text)">close</span>
              </button>
              <div
                class="w-full overflow-hidden rounded-t-lg"
                style="aspect-ratio: 16/9; background: var(--color-surface)"
              >
                @if (expandedClue()!.imageUrl) {
                  <img
                    [src]="expandedClue()!.imageUrl"
                    [alt]="expandedClue()!.name"
                    class="w-full h-full object-cover"
                  />
                } @else {
                  <div class="w-full h-full flex items-center justify-center opacity-20">
                    <span class="material-icons" style="font-size: 5rem; color: var(--color-text)">
                      search
                    </span>
                  </div>
                }
              </div>
              <div class="p-6 flex flex-col gap-4">
                <div class="flex items-center gap-2">
                  <span class="material-icons mi-md" style="color: var(--color-accent)"
                    >manage_search</span
                  >
                  <h2 class="font-heading text-2xl" style="color: var(--color-accent)">
                    {{ expandedClue()!.name }}
                  </h2>
                </div>
                <p
                  class="text-base leading-relaxed"
                  style="font-family: var(--font-body); color: var(--color-text)"
                >
                  {{ expandedClue()!.description }}
                </p>
                <div
                  class="rounded p-4 flex flex-col gap-2"
                  style="background: var(--color-surface); border: var(--border-style)"
                >
                  <span
                    class="font-mono text-xs uppercase tracking-widest flex items-center gap-1.5"
                    style="color: var(--color-accent)"
                  >
                    <span class="material-icons" style="font-size: 0.9rem">lightbulb</span>
                    What this reveals
                  </span>
                  <p
                    class="text-sm leading-relaxed italic"
                    style="font-family: var(--font-body); color: var(--color-text)"
                  >
                    {{ expandedClue()!.revealsInfo }}
                  </p>
                </div>
                <p class="font-mono text-xs" style="color: var(--color-text-muted)">
                  <span class="material-icons" style="font-size: 0.8rem; vertical-align: middle"
                    >location_on</span
                  >
                  Found at: {{ clueLocationName(expandedClue()!.locationId) }}
                </p>
              </div>
            </div>
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
  private readonly imageService = inject(ImageService);
  private readonly theme = inject(ThemeService);

  readonly isLoading = signal(true);
  readonly casePackage = signal<CasePackage | null>(null);
  readonly expandedSuspect = signal<Suspect | null>(null);
  readonly expandedClue = signal<Clue | null>(null);

  readonly gameState = this.gsvc.state;
  readonly finalAccusation = computed(() => this.gameState()?.finalAccusation ?? null);

  readonly isCulpritCorrect = computed((): boolean => {
    const pkg = this.casePackage();
    const accusation = this.finalAccusation();
    if (!pkg || !accusation) return false;
    return accusation.culpritId === pkg.truth.culpritId;
  });

  readonly isMethodMatched = computed((): boolean => {
    const pkg = this.casePackage();
    const accusation = this.finalAccusation();
    if (!pkg || !accusation) return false;

    const submitted = this.normalizeText(accusation.method);
    const truth = this.normalizeText(pkg.truth.method);

    if (!submitted || !truth) return false;
    if (submitted === truth) return true;
    if (submitted.includes(truth) || truth.includes(submitted)) return true;

    const truthTokens = new Set(truth.split(' ').filter((token) => token.length > 3));
    if (truthTokens.size === 0) return false;

    let overlap = 0;
    for (const token of submitted.split(' ')) {
      if (truthTokens.has(token)) overlap++;
    }

    return overlap >= Math.max(2, Math.ceil(truthTokens.size / 3));
  });

  readonly isCorrect = computed((): boolean => {
    return this.isCulpritCorrect() && this.isMethodMatched();
  });

  readonly culprit = computed((): Suspect | undefined => {
    const pkg = this.casePackage();
    if (!pkg) return undefined;
    return pkg.suspects.find((s) => s.id === pkg.truth.culpritId);
  });

  readonly accusedSuspect = computed((): Suspect | undefined => {
    const pkg = this.casePackage();
    const accusation = this.finalAccusation();
    if (!pkg || !accusation) return undefined;
    return pkg.suspects.find((s) => s.id === accusation.culpritId);
  });

  readonly accusedEvidence = computed((): Clue[] => {
    const pkg = this.casePackage();
    const accusation = this.finalAccusation();
    if (!pkg || !accusation) return [];
    return pkg.clues.filter((clue) => accusation.evidenceIds.includes(clue.id));
  });

  readonly submittedMotive = computed(() => this.finalAccusation()?.motive ?? '');

  readonly submittedMethod = computed(() => this.finalAccusation()?.method ?? '');

  readonly allClues = computed((): Clue[] => {
    return this.casePackage()?.clues ?? [];
  });

  readonly allSuspects = computed((): Suspect[] => {
    return this.casePackage()?.suspects ?? [];
  });

  readonly totalSteps = computed((): number => {
    return this.casePackage()?.solutionExplanation.stepsExplained.length ?? 0;
  });

  readonly visibleSteps = computed((): string[] => {
    return this.casePackage()?.solutionExplanation.stepsExplained ?? [];
  });

  clueLocationName(locationId: string): string {
    return (
      this.casePackage()?.locations.find((location) => location.id === locationId)?.name ??
      locationId
    );
  }

  readonly score = computed((): number => {
    const pkg = this.casePackage();
    const state = this.gameState();
    if (!pkg || !state) return 0;

    let points = 1000;

    // Deduct for hints
    points -= state.hintsUsed * 50;

    if (!this.isCulpritCorrect()) {
      points -= 300;
    } else if (!this.isMethodMatched()) {
      points -= 75;
    }

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
    if (!this.isCulpritCorrect()) {
      if (s >= 700) {
        return { letter: 'D', colour: 'rgb(253,186,116)', label: 'Wrong Conclusion' };
      }
      return { letter: 'F', colour: 'rgb(252,165,165)', label: 'Case Unsolved' };
    }
    if (!this.isMethodMatched()) {
      if (s >= 900) {
        return { letter: 'A', colour: 'rgb(134,239,172)', label: 'Culprit Identified' };
      }
      if (s >= 750) {
        return { letter: 'B', colour: 'rgb(147,197,253)', label: 'Strong Deduction' };
      }
      if (s >= 600) {
        return { letter: 'C', colour: 'rgb(253,186,116)', label: 'Close, But Incomplete' };
      }
      return { letter: 'D', colour: 'rgb(253,186,116)', label: 'Missing Key Details' };
    }
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

      // Re-hydrate blob URLs from IndexedDB so images still render after navigation or refresh.
      this.imageService.generateAllCaseImages(pkg).subscribe({
        next: (updated) => this.casePackage.set(updated),
      });
    });
  }

  playAgain(): void {
    this.gsvc.clearState();
    this.theme.resetTheme();
    void this.router.navigate(['/']);
  }

  goHome(): void {
    this.gsvc.clearState();
    this.theme.resetTheme();
    void this.router.navigate(['/']);
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
