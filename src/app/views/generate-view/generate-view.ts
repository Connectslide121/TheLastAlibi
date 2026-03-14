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

@Component({
  selector: 'app-generate-view',
  standalone: true,
  imports: [LoadingScreenComponent],
  template: `
    @if (!error()) {
      <app-loading-screen [message]="loadingMessage()" />
    } @else {
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
          <span class="group-hover:underline"> Back to Home</span>
        </button>
      </div>
    }
  `,
})
export class GenerateView implements OnInit {
  private readonly router = inject(Router);
  private readonly llm = inject(LlmService);
  private readonly imageService = inject(ImageService);
  private readonly gameState = inject(GameStateService);
  private readonly caseStore = inject(CaseStoreService);
  private readonly theme = inject(ThemeService);

  readonly loadingMessage = signal('Crafting your case...');
  readonly error = signal('');

  private difficulty: Difficulty = 'normal';
  private style = 'Classic noir illustration';

  ngOnInit(): void {
    const nav = this.router.getCurrentNavigation();
    const state = nav?.extras?.state as { difficulty?: Difficulty; style?: string } | undefined;
    if (state?.difficulty) this.difficulty = state.difficulty;
    if (state?.style) this.style = state.style;
    this.generate();
  }

  generate(): void {
    this.error.set('');
    this.loadingMessage.set('Crafting your case...');

    this.llm.generateCasePackage(this.difficulty, this.style).subscribe({
      next: (pkg: CasePackage) => {
        this.loadingMessage.set('Applying the theme...');
        this.theme.applyTheme(pkg.uiTheme);
        this.theme.applyTexture(pkg.uiTheme.textureFamily);

        this.loadingMessage.set('Saving case files...');
        this.caseStore.storeCase(pkg).subscribe(() => {
          this.gameState.initState(pkg.id);

          // Kick off image generation in the background — don't block navigation
          this.imageService.generateAllCaseImages(pkg).subscribe({
            next: (updated) => this.caseStore.storeCase(updated).subscribe(),
          });

          void this.router.navigate(['/investigation'], { state: { sessionId: pkg.id } });
        });
      },
      error: (err: Error) => {
        this.error.set(
          `Failed to generate case: ${err.message}. Check your API key and try again.`,
        );
      },
    });
  }

  goHome(): void {
    void this.router.navigate(['/']);
  }
}
