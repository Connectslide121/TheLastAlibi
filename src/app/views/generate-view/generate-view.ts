import { Component, OnInit, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DebugTraceService } from '../../services/debug-trace.service';
import { LlmService } from '../../services/llm.service';
import { isQuotaError } from '../../services/worker-llm';
import { ImageService } from '../../services/image.service';
import { GameStateService } from '../../services/game-state.service';
import { CaseStoreService } from '../../services/case-store.service';
import { ThemeService } from '../../services/theme.service';
import { TtsService } from '../../services/tts.service';
import { LoadingScreenComponent } from '../../components';
import { CasePackage } from '../../models';

type Difficulty = 'easy' | 'normal' | 'hard' | 'genius';
type Phase = 'loading' | 'error';

@Component({
  selector: 'app-generate-view',
  standalone: true,
  imports: [LoadingScreenComponent],
  template: `
    @if (phase() === 'loading') {
      @if (readyPkg()) {
        <!-- Generation complete — show CTA on the loading screen -->
        <div
          class="min-h-screen w-full flex flex-col items-center justify-center gap-8 px-6"
          style="background: var(--color-primary)"
        >
          <div
            class="flex flex-col items-center gap-6"
            style="animation: briefingIn 0.5s ease both"
          >
            <span class="material-icons" style="font-size: 3.5rem; color: var(--color-accent)"
              >check_circle</span
            >
            <h2 class="font-heading text-3xl text-center" style="color: var(--color-accent)">
              {{ readyPkg()!.metadata.title }}
            </h2>
            <p class="font-mono text-sm text-center" style="color: var(--color-text-muted)">
              Case ready — your investigation awaits.
            </p>
            <button
              type="button"
              (click)="beginInvestigation()"
              class="mt-2 px-10 py-4 rounded font-mono uppercase tracking-widest text-sm cursor-pointer transition-all hover:opacity-90 active:scale-95 flex items-center gap-3"
              style="background: var(--color-accent); color: var(--color-primary)"
            >
              <span class="material-icons" style="font-size: 1.25rem">search</span>
              Go to Case
            </button>
            <button
              type="button"
              (click)="goHome()"
              class="font-mono text-xs tracking-widest uppercase opacity-40 hover:opacity-70 cursor-pointer transition-opacity flex items-center gap-1"
              style="color: var(--color-text)"
            >
              <span class="material-icons" style="font-size: 0.9rem">arrow_back</span>
              Back to Home
            </button>
          </div>
        </div>
      } @else {
        <app-loading-screen [steps]="llm.generationSteps()" />
      }
    } @else if (phase() === 'error') {
      <!-- Error state -->
      <div
        class="min-h-screen bg-(--color-primary) flex flex-col items-center justify-center gap-6 px-6"
      >
        <p class="text-red-400 text-lg text-center max-w-md">{{ error() }}</p>
        <button
          type="button"
          (click)="generate()"
          class="px-8 py-3 rounded border font-mono uppercase tracking-widest text-sm cursor-pointer transition-opacity hover:opacity-80 flex items-center gap-2"
          style="border-color: var(--color-accent); color: var(--color-accent);"
        >
          <span class="material-icons mi-sm">refresh</span>
          Try Again
        </button>
        <button
          type="button"
          (click)="goHome()"
          class="text-(--color-text) text-sm opacity-50 hover:opacity-80 cursor-pointer group flex items-center gap-1"
        >
          <span class="material-icons mi-sm">home</span>
          <span class="group-hover:underline">Back to Home</span>
        </button>
      </div>
    }
  `,
})
export class GenerateView implements OnInit {
  private readonly router = inject(Router);
  private readonly debugTrace = inject(DebugTraceService);
  readonly llm = inject(LlmService);
  private readonly imageService = inject(ImageService);
  private readonly ttsService = inject(TtsService);
  private readonly gameState = inject(GameStateService);
  private readonly caseStore = inject(CaseStoreService);
  private readonly theme = inject(ThemeService);

  readonly phase = signal<Phase>('loading');
  readonly error = signal('');
  readonly readyPkg = signal<CasePackage | null>(null);

  private difficulty: Difficulty = 'normal';
  private style = 'Classic noir illustration';

  ngOnInit(): void {
    const nav = this.router.getCurrentNavigation();
    const state = (nav?.extras?.state ?? (window.history.state as Record<string, unknown>)) as
      | { difficulty?: Difficulty; style?: string }
      | undefined;
    if (state?.difficulty) this.difficulty = state.difficulty;
    if (state?.style) this.style = state.style;
    this.generate();
  }

  generate(): void {
    this.error.set('');
    this.phase.set('loading');
    this.debugTrace.resetRun();

    this.llm.generateCasePackage(this.difficulty, this.style).subscribe({
      next: (pkg: CasePackage) => {
        this.theme.applyTheme(pkg.uiTheme);
        this.theme.applyTexture(pkg.uiTheme.textureFamily);

        this.caseStore.storeCase(pkg).subscribe(() => {
          this.caseStore.storeDebugTrace(pkg.id, this.debugTrace.snapshot()).subscribe(() => {
            this.gameState.initState(pkg.id);
            this.readyPkg.set(pkg);
            // Stay on loading phase — the template shows the Go to Case button
            // once readyPkg is set.

            // Pre-generate TTS narrations in the background (fire-and-forget).
            this.ttsService
              .preGenerateNarrations(pkg.id, [
                { key: 'briefing', text: pkg.metadata.briefing },
                {
                  key: 'act1',
                  text: `Act I: The Investigation Begins. ${pkg.metadata.act1Summary}`,
                },
                { key: 'act2', text: `Act II: Deeper Lies. ${pkg.metadata.act2Summary}` },
                { key: 'act3', text: `Act III: The Final Deduction. ${pkg.metadata.act3Summary}` },
              ])
              .subscribe();

            // Continue loading images in the background so the briefing is usable immediately.
            this.llm.markImageStepActive();
            this.imageService.generateAllCaseImages(pkg).subscribe({
              next: (updated) => {
                this.readyPkg.set(updated);
                this.caseStore.storeDebugTrace(pkg.id, this.debugTrace.snapshot()).subscribe();
              },
              complete: () => {
                this.llm.markImageStepDone();
                this.caseStore.storeDebugTrace(pkg.id, this.debugTrace.snapshot()).subscribe();
              },
              error: () => {
                this.llm.markImageStepDone();
                this.caseStore.storeDebugTrace(pkg.id, this.debugTrace.snapshot()).subscribe();
              },
            });
          });
        });
      },
      error: (err: Error) => {
        this.error.set(
          isQuotaError(err)
            ? "The agency is closed for today: this game's free AI quota has run out. It resets at midnight UTC, so please come back tomorrow."
            : `Failed to generate case: ${err.message}. Please try again.`,
        );
        this.phase.set('error');
      },
    });
  }

  beginInvestigation(): void {
    const pkg = this.readyPkg();
    if (!pkg) return;
    void this.router.navigate(['/investigation'], { state: { sessionId: pkg.id } });
  }

  goHome(): void {
    void this.router.navigate(['/']);
  }
}
