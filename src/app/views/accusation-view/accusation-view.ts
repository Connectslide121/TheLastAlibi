import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CaseStoreService } from '../../services/case-store.service';
import { GameStateService } from '../../services/game-state.service';
import { CasePackage, Suspect, Clue, FinalAccusation } from '../../models';

@Component({
  selector: 'app-accusation-view',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="min-h-screen bg-(--color-primary) flex flex-col">
      <!-- Top Bar -->
      <header
        class="px-6 py-4 bg-(--color-surface) shrink-0"
        style="border-bottom: var(--border-style);"
      >
        <h1 class="font-heading text-2xl text-(--color-accent)">Make Your Accusation</h1>
        <p class="text-sm text-(--color-text-muted) mt-0.5 font-mono">
          {{ casePackage()?.metadata?.title }}
        </p>
      </header>

      @if (isLoading()) {
        <div class="flex-1 flex items-center justify-center">
          <p class="text-(--color-text-muted) animate-pulse font-mono">Loading…</p>
        </div>
      } @else {
        <div class="flex-1 overflow-y-auto px-6 py-8 max-w-3xl mx-auto w-full">
          <!-- Suspect Selector -->
          <section class="mb-8">
            <h2 class="font-mono text-xs uppercase tracking-widest text-(--color-text-muted) mb-4">
              Who did it?
            </h2>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              @for (suspect of unlockedSuspects(); track suspect.id) {
                <button
                  type="button"
                  (click)="selectedCulpritId.set(suspect.id)"
                  class="flex flex-col items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all"
                  [style.border-color]="
                    selectedCulpritId() === suspect.id
                      ? 'var(--color-accent)'
                      : 'rgba(201,168,76,0.2)'
                  "
                  [style.background]="
                    selectedCulpritId() === suspect.id
                      ? 'rgba(201,168,76,0.1)'
                      : 'var(--color-secondary)'
                  "
                >
                  @if (suspect.imageUrl) {
                    <img
                      [src]="suspect.imageUrl"
                      [alt]="suspect.name"
                      class="w-16 h-16 rounded-full object-cover"
                    />
                  } @else {
                    <div
                      class="w-16 h-16 rounded-full flex items-center justify-center text-2xl bg-(--color-surface)"
                    >
                      🧑
                    </div>
                  }
                  <span
                    class="font-heading text-sm text-center leading-tight"
                    [style.color]="
                      selectedCulpritId() === suspect.id
                        ? 'var(--color-accent)'
                        : 'var(--color-text)'
                    "
                  >
                    {{ suspect.name }}
                  </span>
                  <span class="text-xs text-(--color-text-muted) text-center">{{
                    suspect.occupation
                  }}</span>
                </button>
              }
            </div>
          </section>

          <!-- Motive -->
          <section class="mb-6">
            <label
              class="block font-mono text-xs uppercase tracking-widest text-(--color-text-muted) mb-2"
            >
              What was their motive?
            </label>
            <textarea
              [(ngModel)]="motive"
              rows="3"
              placeholder="Describe why you believe they did it…"
              class="w-full rounded-lg p-3 font-body text-sm text-(--color-text) resize-none outline-none focus:ring-1"
              style="background: var(--color-secondary); border: var(--border-style); focus-ring-color: var(--color-accent);"
            ></textarea>
          </section>

          <!-- Method -->
          <section class="mb-6">
            <label
              class="block font-mono text-xs uppercase tracking-widest text-(--color-text-muted) mb-2"
            >
              How was it done?
            </label>
            <textarea
              [(ngModel)]="method"
              rows="3"
              placeholder="Describe the method used…"
              class="w-full rounded-lg p-3 font-body text-sm text-(--color-text) resize-none outline-none focus:ring-1"
              style="background: var(--color-secondary); border: var(--border-style);"
            ></textarea>
          </section>

          <!-- Supporting Evidence -->
          <section class="mb-8">
            <h2 class="font-mono text-xs uppercase tracking-widest text-(--color-text-muted) mb-3">
              Supporting evidence
            </h2>
            @if (foundClues().length === 0) {
              <p class="text-sm text-(--color-text-muted) italic">No evidence found yet.</p>
            }
            <div class="flex flex-col gap-2">
              @for (clue of foundClues(); track clue.id) {
                <label
                  class="flex items-start gap-3 p-3 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  style="background: var(--color-secondary); border: 1px solid rgba(201,168,76,0.15);"
                >
                  <input
                    type="checkbox"
                    [value]="clue.id"
                    [checked]="selectedEvidenceIds().includes(clue.id)"
                    (change)="toggleEvidence(clue.id)"
                    class="mt-0.5 shrink-0 accent-(--color-accent)"
                  />
                  <div>
                    <p class="font-heading text-sm text-(--color-accent)">{{ clue.name }}</p>
                    <p class="text-xs text-(--color-text-muted) mt-0.5">{{ clue.description }}</p>
                  </div>
                </label>
              }
            </div>
          </section>

          <!-- Submit -->
          <button
            type="button"
            (click)="attemptSubmit()"
            [disabled]="!canSubmit()"
            class="w-full py-3 rounded-lg font-mono uppercase tracking-widest text-sm cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-80 transition-opacity"
            style="background: rgba(127,29,29,0.5); border: 1px solid rgb(185,28,28); color: rgb(252,165,165);"
          >
            Submit My Theory
          </button>
        </div>
      }

      <!-- Confirmation Modal -->
      @if (showConfirmation()) {
        <div
          class="fixed inset-0 flex items-center justify-center z-50"
          style="background: rgba(0,0,0,0.7);"
        >
          <div
            class="rounded-xl p-8 max-w-md w-full mx-4"
            style="background: var(--color-secondary); border: var(--border-style); box-shadow: var(--shadow-style);"
          >
            <h2 class="font-heading text-xl text-(--color-accent) mb-3">Are you certain?</h2>
            <p class="text-(--color-text) text-sm mb-2">
              You're accusing <strong>{{ selectedSuspectName() }}</strong
              >.
            </p>
            <p class="text-(--color-text-muted) text-sm mb-6">
              Once you submit, there's no going back. The truth will be revealed.
            </p>
            <div class="flex gap-3">
              <button
                type="button"
                (click)="confirmSubmit()"
                class="flex-1 py-2.5 rounded font-mono uppercase tracking-widest text-sm cursor-pointer hover:opacity-80 transition-opacity"
                style="background: rgba(127,29,29,0.5); border: 1px solid rgb(185,28,28); color: rgb(252,165,165);"
              >
                Yes, I'm sure
              </button>
              <button
                type="button"
                (click)="showConfirmation.set(false)"
                class="flex-1 py-2.5 rounded border font-mono uppercase tracking-widest text-sm cursor-pointer hover:opacity-80 transition-opacity border-(--color-text-muted) text-(--color-text-muted)"
              >
                Wait, let me think
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class AccusationView implements OnInit {
  private readonly router = inject(Router);
  private readonly caseStore = inject(CaseStoreService);
  private readonly gsvc = inject(GameStateService);

  readonly isLoading = signal(true);
  readonly casePackage = signal<CasePackage | null>(null);
  readonly selectedCulpritId = signal('');
  readonly selectedEvidenceIds = signal<string[]>([]);
  readonly showConfirmation = signal(false);

  motive = '';
  method = '';

  readonly gameState = this.gsvc.state;

  readonly unlockedSuspects = computed((): Suspect[] => {
    const pkg = this.casePackage();
    const state = this.gameState();
    if (!pkg || !state) return [];
    return pkg.suspects.filter((s) => state.unlockedSuspectIds.includes(s.id));
  });

  readonly foundClues = computed((): Clue[] => {
    const pkg = this.casePackage();
    const state = this.gameState();
    if (!pkg || !state) return [];
    return pkg.clues.filter((c) => state.foundClueIds.includes(c.id));
  });

  readonly canSubmit = computed(
    () =>
      !!this.selectedCulpritId() && this.motive.trim().length > 0 && this.method.trim().length > 0,
  );

  readonly selectedSuspectName = computed(() => {
    const id = this.selectedCulpritId();
    return this.casePackage()?.suspects.find((s) => s.id === id)?.name ?? '';
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
      this.isLoading.set(false);
    });
  }

  toggleEvidence(clueId: string): void {
    const current = this.selectedEvidenceIds();
    if (current.includes(clueId)) {
      this.selectedEvidenceIds.set(current.filter((id) => id !== clueId));
    } else {
      this.selectedEvidenceIds.set([...current, clueId]);
    }
  }

  attemptSubmit(): void {
    if (!this.canSubmit()) return;
    this.showConfirmation.set(true);
  }

  confirmSubmit(): void {
    const pkg = this.casePackage();
    if (!pkg) return;

    const accusation: FinalAccusation = {
      culpritId: this.selectedCulpritId(),
      motive: this.motive.trim(),
      method: this.method.trim(),
      evidenceIds: this.selectedEvidenceIds(),
    };

    this.gsvc.submitAccusation(accusation, pkg);
    this.showConfirmation.set(false);
    void this.router.navigate(['/reveal']);
  }
}
