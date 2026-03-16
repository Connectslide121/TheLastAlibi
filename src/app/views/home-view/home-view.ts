import { Component, signal, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GameStateService } from '../../services/game-state.service';
import { CaseStoreService, SavedCaseSummary } from '../../services/case-store.service';

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
          class="w-full py-3 rounded font-mono uppercase tracking-widest text-sm font-bold border transition-all cursor-pointer hover:opacity-90 flex items-center justify-center gap-2"
          style="background: var(--color-accent); color: var(--color-primary); border-color: var(--color-accent);"
        >
          <span class="material-icons mi-sm">add_circle</span>
          New Case
        </button>
      </div>

      <!-- Saved Cases -->
      @if (savedCases().length > 0) {
        <div class="w-full max-w-xl flex flex-col gap-3">
          <h2
            class="font-mono text-xs uppercase tracking-widest text-(--color-text-muted) text-center flex items-center justify-center gap-1.5"
          >
            <span class="material-icons mi-sm">folder_open</span>
            Saved Investigations
          </h2>
          @for (c of savedCases(); track c.id) {
            <div
              class="fade-in flex items-center gap-4 px-5 py-4 rounded-lg border"
              style="background: var(--color-surface); border-color: rgba(201,168,76,0.2);"
            >
              <!-- Case info -->
              <div class="flex-1 min-w-0">
                <h3 class="font-heading text-(--color-accent) text-base truncate">{{ c.title }}</h3>
                <p class="font-mono text-xs text-(--color-text-muted) mt-0.5 capitalize">
                  {{ c.caseType }} · {{ c.difficulty }} · {{ formatDate(c.savedAt) }}
                </p>
              </div>
              <!-- Actions -->
              <div class="flex gap-2 shrink-0">
                <button
                  type="button"
                  (click)="continueCase(c.id)"
                  class="px-3 py-1.5 text-xs font-mono uppercase tracking-widest rounded border cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1"
                  style="border-color: var(--color-accent); color: var(--color-accent);"
                >
                  <span class="material-icons mi-sm">play_circle</span>
                  Resume
                </button>
                <button
                  type="button"
                  (click)="deleteCase(c)"
                  class="px-3 py-1.5 text-xs font-mono uppercase tracking-widest rounded border cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1"
                  style="border-color: rgba(239,68,68,0.5); color: rgb(252,165,165);"
                >
                  <span class="material-icons mi-sm">delete</span>
                  Delete
                </button>
              </div>
            </div>
          }
        </div>
      }

      <!-- Confirm delete modal -->
      @if (pendingDelete()) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-6"
          style="background: rgba(0,0,0,0.75);"
          (click)="pendingDelete.set(null)"
        >
          <div
            class="fade-in w-full max-w-sm rounded-lg p-8 flex flex-col gap-5"
            style="background: var(--color-surface); border: var(--border-style);"
            (click)="$event.stopPropagation()"
          >
            <h3 class="font-heading text-(--color-accent) text-xl flex items-center gap-2">
              <span class="material-icons mi-lg">delete_forever</span>
              Delete this case?
            </h3>
            <p class="text-sm text-(--color-text) opacity-80">
              "<strong>{{ pendingDelete()!.title }}</strong
              >" will be permanently deleted. This cannot be undone.
            </p>
            <div class="flex gap-3">
              <button
                type="button"
                (click)="confirmDelete()"
                class="flex-1 py-2 rounded font-mono text-xs uppercase tracking-widest border cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center gap-1.5"
                style="border-color: rgb(239,68,68); color: rgb(252,165,165);"
              >
                <span class="material-icons mi-sm">delete_forever</span>
                Delete
              </button>
              <button
                type="button"
                (click)="pendingDelete.set(null)"
                class="flex-1 py-2 rounded font-mono text-xs uppercase tracking-widest border cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center gap-1.5"
                style="border-color: rgba(201,168,76,0.4); color: var(--color-accent);"
              >
                <span class="material-icons mi-sm">cancel</span>
                Cancel
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  imports: [FormsModule],
})
export class HomeView implements OnInit {
  private readonly router = inject(Router);
  private readonly caseStore = inject(CaseStoreService);
  private readonly gsvc = inject(GameStateService);

  readonly difficulty = signal<Difficulty>('normal');
  readonly savedCases = signal<SavedCaseSummary[]>([]);
  readonly pendingDelete = signal<SavedCaseSummary | null>(null);
  selectedStyle = ART_STYLES[0];

  readonly difficulties: Difficulty[] = ['easy', 'normal', 'hard', 'genius'];
  readonly artStyles = ART_STYLES;

  ngOnInit(): void {
    this.loadSavedCases();
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

  continueCase(sessionId: string): void {
    this.gsvc.loadState(sessionId);
    void this.router.navigate(['/investigation'], { state: { sessionId } });
  }

  deleteCase(c: SavedCaseSummary): void {
    this.pendingDelete.set(c);
  }

  confirmDelete(): void {
    const c = this.pendingDelete();
    if (!c) return;
    this.pendingDelete.set(null);
    this.gsvc.deleteState(c.id);
    this.caseStore.deleteCase(c.id).subscribe(() => this.loadSavedCases());
  }

  formatDate(iso: string): string {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  private loadSavedCases(): void {
    this.caseStore.listSavedCases().subscribe((cases) => {
      this.savedCases.set(cases);
    });
  }
}
