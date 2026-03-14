import { Component, signal, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GameStateService } from '../../services/game-state.service';
import { CaseStoreService } from '../../services/case-store.service';

type Difficulty = 'easy' | 'normal' | 'hard' | 'genius';

const ART_STYLES = [
  'Classic noir illustration',
  '1920s art deco',
  'Victorian gothic engraving',
  'Pixel art detective',
  'Watercolour mystery',
  'Pulp paperback cover art',
  'Surprise Me',
];

@Component({
  selector: 'app-home-view',
  standalone: true,
  template: `
    <div
      class="min-h-screen bg-(--color-primary) flex flex-col items-center justify-center px-6 py-12 gap-10"
    >
      <!-- Logo + title -->
      <div class="flex flex-col items-center gap-4 text-center">
        <img
          src="favicon.png"
          alt="The Last Alibi"
          class="w-28 h-28 object-contain drop-shadow-lg"
        />
        <h1
          class="text-5xl font-bold text-(--color-accent)"
          style="font-family: var(--font-heading);"
        >
          The Last Alibi
        </h1>
        <p
          class="text-(--color-text) opacity-60 text-lg max-w-md leading-relaxed"
          style="font-family: var(--font-body);"
        >
          An AI-generated murder mystery. Every case is unique. Every alibi is a lie.
        </p>
      </div>

      <!-- Controls card -->
      <div
        class="w-full max-w-sm flex flex-col gap-5 rounded border p-8 bg-(--color-surface)"
        style="border-color: rgba(201,168,76,0.3);"
      >
        <!-- Difficulty -->
        <div class="flex flex-col gap-2">
          <label class="text-(--color-accent) text-xs uppercase tracking-widest font-mono"
            >Difficulty</label
          >
          <div class="grid grid-cols-4 gap-1">
            @for (d of difficulties; track d) {
              <button
                type="button"
                (click)="difficulty.set(d)"
                class="py-2 rounded text-xs font-mono uppercase tracking-wide border transition-colors cursor-pointer"
                [style.border-color]="
                  difficulty() === d ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'
                "
                [style.color]="difficulty() === d ? 'var(--color-accent)' : 'var(--color-text)'"
                [style.background]="difficulty() === d ? 'rgba(201,168,76,0.1)' : 'transparent'"
              >
                {{ d }}
              </button>
            }
          </div>
        </div>

        <!-- Visual style -->
        <div class="flex flex-col gap-2">
          <label class="text-(--color-accent) text-xs uppercase tracking-widest font-mono"
            >Visual Style</label
          >
          <select
            [(ngModel)]="selectedStyle"
            class="w-full rounded border px-3 py-2 text-sm bg-(--color-secondary) text-(--color-text) cursor-pointer"
            style="border-color: rgba(201,168,76,0.3);"
          >
            @for (s of artStyles; track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
        </div>

        <!-- New Case button -->
        <button
          type="button"
          (click)="startNewCase()"
          class="w-full py-3 rounded font-mono uppercase tracking-widest text-sm font-bold border transition-all cursor-pointer hover:opacity-90"
          style="background: var(--color-accent); color: var(--color-primary); border-color: var(--color-accent);"
        >
          New Case
        </button>

        <!-- Continue button -->
        @if (hasSavedCase()) {
          <button
            type="button"
            (click)="continueCase()"
            class="w-full py-3 rounded font-mono uppercase tracking-widest text-sm border transition-all cursor-pointer hover:opacity-90"
            style="border-color: rgba(201,168,76,0.4); color: var(--color-accent);"
          >
            Continue Investigation
          </button>
        }
      </div>
    </div>
  `,
  imports: [FormsModule],
})
export class HomeView implements OnInit {
  private readonly router = inject(Router);
  private readonly caseStore = inject(CaseStoreService);

  readonly difficulty = signal<Difficulty>('normal');
  readonly hasSavedCase = signal(false);
  selectedStyle = ART_STYLES[0];

  readonly difficulties: Difficulty[] = ['easy', 'normal', 'hard', 'genius'];
  readonly artStyles = ART_STYLES;

  ngOnInit(): void {
    this.caseStore.listSavedCases().subscribe((cases) => {
      this.hasSavedCase.set(cases.length > 0);
    });
  }

  startNewCase(): void {
    const style =
      this.selectedStyle === 'Surprise Me'
        ? ART_STYLES[Math.floor(Math.random() * (ART_STYLES.length - 1))]
        : this.selectedStyle;
    void this.router.navigate(['/generate'], {
      state: { difficulty: this.difficulty(), style },
    });
  }

  continueCase(): void {
    void this.router.navigate(['/investigation']);
  }
}
