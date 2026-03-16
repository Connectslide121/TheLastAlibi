import { Component, OnInit, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LlmService } from '../../services/llm.service';
import { ImageService } from '../../services/image.service';
import { GameStateService } from '../../services/game-state.service';
import { CaseStoreService } from '../../services/case-store.service';
import { ThemeService } from '../../services/theme.service';
import { LoadingScreenComponent } from '../../components';
import { CasePackage } from '../../models';

type Difficulty = 'easy' | 'normal' | 'hard' | 'genius';
type Phase = 'loading' | 'briefing' | 'error';

const CASE_TYPE_LABELS: Record<string, string> = {
  murder: 'Murder Investigation',
  theft: 'Theft Investigation',
  disappearance: 'Missing Persons Case',
  sabotage: 'Sabotage Investigation',
  other: 'Criminal Investigation',
};

@Component({
  selector: 'app-generate-view',
  standalone: true,
  imports: [LoadingScreenComponent],
  template: `
    @if (phase() === 'loading') {
      <app-loading-screen [steps]="llm.generationSteps()" />
    } @else if (phase() === 'briefing') {
      <!-- Case Briefing / Introduction Screen -->
      <div
        class="min-h-screen w-full flex flex-col items-center justify-center px-6 py-16"
        style="background: var(--color-primary)"
      >
        <div
          class="w-full max-w-2xl flex flex-col gap-8"
          style="animation: briefingIn 0.7s ease both"
        >
          <!-- Header badge -->
          <div class="flex flex-col items-center gap-3 text-center">
            <span
              class="font-mono text-xs tracking-widest uppercase px-4 py-1.5 rounded-full"
              style="border: var(--border-style); color: var(--color-accent); background: var(--color-surface)"
            >
              {{ caseTypeLabel() }}
            </span>
            <h1
              class="font-heading text-4xl sm:text-5xl leading-tight"
              style="color: var(--color-accent)"
            >
              {{ readyPkg()?.metadata?.title }}
            </h1>
            @if (readyPkg()?.metadata?.subtitle) {
              <p
                class="font-mono text-sm tracking-widest uppercase opacity-60"
                style="color: var(--color-text)"
              >
                {{ readyPkg()?.metadata?.subtitle }}
              </p>
            }
          </div>

          <!-- Divider -->
          <div class="w-full h-px opacity-30" style="background: var(--color-accent)"></div>

          <!-- Setting pill -->
          <div class="flex items-center gap-3">
            <span
              class="material-icons shrink-0"
              style="color: var(--color-accent); font-size: 1.25rem"
              >location_on</span
            >
            <span class="font-mono text-sm" style="color: var(--color-text-muted)">
              {{ readyPkg()?.metadata?.setting }}
            </span>
          </div>

          <!-- Hero image (appears once briefing image is generated) -->
          @if (readyPkg()?.briefingImageUrl) {
            <div
              class="w-full rounded-lg overflow-hidden"
              style="aspect-ratio: 3/2; border: var(--border-style); box-shadow: var(--shadow-style)"
            >
              <img
                [src]="readyPkg()!.briefingImageUrl"
                [alt]="readyPkg()?.metadata?.title"
                class="w-full h-full object-cover"
              />
            </div>
          } @else {
            <!-- Skeleton while image loads -->
            <div
              class="w-full rounded-lg animate-pulse"
              style="aspect-ratio: 3/2; background: var(--color-surface); border: var(--border-style)"
            ></div>
          }

          <!-- Briefing text -->
          <div
            class="rounded-lg p-6"
            style="background: var(--color-secondary); border: var(--border-style)"
          >
            <p
              class="font-mono text-xs tracking-widest uppercase mb-4 flex items-center gap-2"
              style="color: var(--color-accent)"
            >
              <span class="material-icons" style="font-size: 1rem">description</span>
              Case Briefing
            </p>
            <p
              class="leading-relaxed text-base"
              style="font-family: var(--font-body); color: var(--color-text)"
            >
              {{ readyPkg()?.metadata?.briefing }}
            </p>
          </div>

          <!-- Difficulty badge -->
          <div class="flex justify-center">
            <span
              class="font-mono text-xs tracking-widest uppercase px-4 py-1.5 rounded-full opacity-60"
              style="border: var(--border-style); color: var(--color-text-muted)"
            >
              Difficulty: {{ readyPkg()?.metadata?.difficulty ?? '' }}
            </span>
          </div>

          <!-- CTA -->
          <div class="flex flex-col items-center gap-4">
            <button
              type="button"
              (click)="beginInvestigation()"
              class="px-10 py-4 rounded font-mono uppercase tracking-widest text-sm cursor-pointer transition-all hover:opacity-90 active:scale-95 flex items-center gap-3"
              style="background: var(--color-accent); color: var(--color-primary)"
            >
              <span class="material-icons" style="font-size: 1.25rem">search</span>
              Begin Investigation
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
      </div>

      <style>
        @keyframes briefingIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      </style>
    } @else {
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
  readonly llm = inject(LlmService);
  private readonly imageService = inject(ImageService);
  private readonly gameState = inject(GameStateService);
  private readonly caseStore = inject(CaseStoreService);
  private readonly theme = inject(ThemeService);

  readonly phase = signal<Phase>('loading');
  readonly error = signal('');
  readonly readyPkg = signal<CasePackage | null>(null);

  private difficulty: Difficulty = 'normal';
  private style = 'Classic noir illustration';

  readonly caseTypeLabel = () => {
    const type = this.readyPkg()?.metadata?.caseType ?? 'other';
    return CASE_TYPE_LABELS[type] ?? CASE_TYPE_LABELS['other'];
  };

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

    this.llm.generateCasePackage(this.difficulty, this.style).subscribe({
      next: (pkg: CasePackage) => {
        this.theme.applyTheme(pkg.uiTheme);
        this.theme.applyTexture(pkg.uiTheme.textureFamily);

        this.caseStore.storeCase(pkg).subscribe(() => {
          this.gameState.initState(pkg.id);
          this.readyPkg.set(pkg);
          this.phase.set('briefing');

          // Continue loading images in the background so the briefing is usable immediately.
          this.llm.markImageStepActive();
          this.imageService.generateAllCaseImages(pkg).subscribe({
            next: (updated) => this.readyPkg.set(updated),
            complete: () => this.llm.markImageStepDone(),
            error: () => {
              this.llm.markImageStepDone();
            },
          });
        });
      },
      error: (err: Error) => {
        this.error.set(
          `Failed to generate case: ${err.message}. Check your API key and try again.`,
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
