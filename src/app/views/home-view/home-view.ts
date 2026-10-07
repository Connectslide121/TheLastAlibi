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
];

interface Building {
  x: number;
  y: number;
  w: number;
  spire: boolean;
}

interface LitWindow {
  x: number;
  y: number;
  warm: boolean;
  delay: number;
}

/** Deterministic PRNG so the skyline is the same on every visit. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function buildSkyline(): { buildings: Building[]; windows: LitWindow[] } {
  const rand = seeded(1947);
  const buildings: Building[] = [];
  const windows: LitWindow[] = [];
  for (let x = -10; x < 1440; ) {
    const w = 50 + Math.floor(rand() * 70);
    // Keep the block low where the streetlamp stands
    const y = x > 1120 && x < 1290 ? 300 : 90 + Math.floor(rand() * 160);
    buildings.push({ x, y, w, spire: rand() > 0.85 });
    for (let wy = y + 12; wy < 300; wy += 16) {
      for (let wx = x + 8; wx < x + w - 10; wx += 12) {
        if (rand() > 0.82) {
          windows.push({ x: wx, y: wy, warm: rand() > 0.25, delay: -Math.floor(rand() * 90) / 10 });
        }
      }
    }
    x += w + Math.floor(rand() * 6);
  }
  return { buildings, windows };
}

function buildFarSkyline(): string {
  const rand = seeded(73);
  let d = 'M0 320';
  for (let x = 0; x < 1440; ) {
    const w = 30 + Math.floor(rand() * 60);
    const h = 60 + Math.floor(rand() * 120);
    d += ` L${x} ${h} L${x + w} ${h}`;
    x += w;
  }
  return d + ' L1440 320 Z';
}

const SKYLINE = buildSkyline();
const FAR_SKYLINE = buildFarSkyline();

const CUSTOM_STYLE_OPTION = 'Custom Style';
const SURPRISE_ME_OPTION = 'Surprise Me';

@Component({
  selector: 'app-home-view',
  standalone: true,
  template: `
    <div class="home relative min-h-screen overflow-hidden bg-(--color-primary)">
      <!-- ── Night scene ─────────────────────────────────────── -->
      <div class="scene" aria-hidden="true">
        <div class="sky"></div>
        <div class="moon"></div>

        <svg
          class="skyline skyline-far"
          viewBox="0 0 1440 320"
          preserveAspectRatio="xMidYMax slice"
        >
          <path [attr.d]="farSkyline" fill="#141428" />
        </svg>

        <svg
          class="skyline skyline-near"
          viewBox="0 0 1440 320"
          preserveAspectRatio="xMidYMax slice"
        >
          @for (b of buildings; track $index) {
            <rect
              [attr.x]="b.x"
              [attr.y]="b.y"
              [attr.width]="b.w"
              [attr.height]="320 - b.y"
              fill="#0b0b18"
            />
            @if (b.spire) {
              <polygon
                [attr.points]="
                  b.x +
                  b.w / 2 -
                  6 +
                  ',' +
                  b.y +
                  ' ' +
                  (b.x + b.w / 2) +
                  ',' +
                  (b.y - 34) +
                  ' ' +
                  (b.x + b.w / 2 + 6) +
                  ',' +
                  b.y
                "
                fill="#0b0b18"
              />
            }
          }
          @for (w of windows; track $index) {
            <rect
              class="window"
              [attr.x]="w.x"
              [attr.y]="w.y"
              width="5"
              height="7"
              [attr.fill]="w.warm ? '#e8c46a' : '#8fa6c9'"
              [style.animation-delay]="w.delay + 's'"
            />
          }
          <!-- Streetlamp + figure -->
          <g class="lamp" transform="translate(1180 0)">
            <polygon class="lamp-cone" points="22,168 -70,320 120,320" fill="url(#cone)" />
            <rect x="18" y="164" width="4" height="156" fill="#07070f" />
            <path d="M12 166 h16 l-3 -10 h-10 z" fill="#07070f" />
            <circle cx="20" cy="168" r="4" fill="#ffe7a8" class="bulb" />
            <!-- detective -->
            <g transform="translate(46 238)" fill="#05050c">
              <ellipse cx="10" cy="4" rx="15" ry="3" />
              <rect x="2" y="-8" width="16" height="11" rx="3" />
              <circle cx="10" cy="10" r="6" />
              <path d="M-2 16 Q10 12 22 16 L26 70 Q10 74 -6 70 Z" />
              <rect x="1" y="68" width="5" height="14" />
              <rect x="14" y="68" width="5" height="14" />
              <circle class="ember" cx="18" cy="12" r="1.3" fill="#ff8a3d" />
            </g>
          </g>
          <defs>
            <linearGradient id="cone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#ffe7a8" stop-opacity="0.35" />
              <stop offset="1" stop-color="#ffe7a8" stop-opacity="0" />
            </linearGradient>
          </defs>
        </svg>

        <div class="rain"></div>
        <div class="fog fog-a"></div>
        <div class="fog fog-b"></div>
        <div class="vignette"></div>
      </div>

      <!-- ── Content ─────────────────────────────────────────── -->
      <div
        class="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 py-12 gap-10"
      >
        <!-- Logo + title -->
        <div class="flex flex-col items-center gap-4 text-center">
          <div class="logo-wrap">
            <img src="favicon.png" alt="The Last Alibi" class="w-28 h-28 object-contain" />
          </div>
          <h1
            class="title text-5xl sm:text-6xl font-bold text-(--color-accent)"
            style="font-family: var(--font-heading);"
          >
            The Last Alibi
          </h1>
          <div class="ornament" aria-hidden="true">
            <span class="rule"></span>
            <span class="material-icons mi-sm">search</span>
            <span class="rule"></span>
          </div>
          <p
            class="text-(--color-text) opacity-75 text-lg max-w-md leading-relaxed"
            style="font-family: var(--font-body);"
          >
            An AI-generated murder mystery. Every case is unique. Every alibi is a lie.
          </p>
        </div>

        <!-- Controls card -->
        <div class="case-file w-full max-w-sm">
          <div class="case-tab font-mono">Case File · No. {{ caseNumber }}</div>
          <div class="case-body flex flex-col gap-5 p-8">
            <div class="stamp font-mono" aria-hidden="true">Unsolved</div>
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
                [(ngModel)]="selectedStyleOption"
                class="w-full rounded border px-3 py-2 text-sm bg-(--color-secondary) text-(--color-text)"
                style="border-color: rgba(201,168,76,0.3);"
              >
                @for (s of styleOptions; track s) {
                  <option [value]="s">{{ s }}</option>
                }
              </select>

              @if (selectedStyleOption === customStyleOption) {
                <input
                  [(ngModel)]="customStyle"
                  type="text"
                  placeholder="Type any visual direction"
                  class="w-full rounded border px-3 py-2 text-sm bg-(--color-secondary) text-(--color-text)"
                  style="border-color: rgba(201,168,76,0.3);"
                />
              }
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
                class="saved-case fade-in flex flex-wrap items-center gap-4 px-5 py-4 rounded-lg border"
                style="border-color: rgba(201,168,76,0.2);"
              >
                <span class="material-icons text-(--color-accent) opacity-70 shrink-0">folder</span>
                <!-- Case info -->
                <div class="flex-1 min-w-0">
                  <h3 class="font-heading text-(--color-accent) text-base truncate">
                    {{ c.title }}
                  </h3>
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
      </div>

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
  styles: `
    .scene {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
    }
    .sky {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse at 78% 12%, rgba(120, 140, 200, 0.18), transparent 45%),
        linear-gradient(to bottom, #070712 0%, #12122a 55%, #1d1a2e 100%);
    }
    .moon {
      position: absolute;
      top: 7%;
      right: 14%;
      width: 110px;
      height: 110px;
      border-radius: 50%;
      background: radial-gradient(circle at 38% 38%, #fbf3dc, #d9cfae 60%, #b9ae8c);
      box-shadow:
        0 0 60px 18px rgba(240, 225, 180, 0.18),
        0 0 160px 60px rgba(240, 225, 180, 0.07);
      opacity: 0.9;
    }
    .skyline {
      position: absolute;
      left: 0;
      bottom: 0;
      width: 100%;
      height: 46vh;
      min-height: 240px;
    }
    .skyline-far {
      height: 52vh;
      opacity: 0.85;
    }
    .window {
      animation: flicker 9s infinite steps(1);
    }
    .bulb {
      filter: drop-shadow(0 0 6px #ffe7a8);
    }
    .lamp-cone {
      animation: lampHum 4s ease-in-out infinite;
    }
    .ember {
      animation: ember 3.5s ease-in-out infinite;
    }
    .rain {
      position: absolute;
      inset: -20% 0 0 0;
      background-image: repeating-linear-gradient(
        104deg,
        transparent 0 7px,
        rgba(180, 200, 255, 0.07) 7px 8px,
        transparent 8px 19px
      );
      background-size: 120px 240px;
      animation: rain 0.6s linear infinite;
      mask-image: linear-gradient(to bottom, transparent, #000 25%, #000 85%, transparent);
    }
    .fog {
      position: absolute;
      left: -50%;
      width: 200%;
      height: 40vh;
      bottom: -6vh;
      background: radial-gradient(ellipse at center, rgba(160, 160, 190, 0.12), transparent 65%);
      filter: blur(8px);
    }
    .fog-a {
      animation: drift 38s linear infinite alternate;
    }
    .fog-b {
      bottom: 6vh;
      opacity: 0.6;
      animation: drift 55s linear infinite alternate-reverse;
    }
    .vignette {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at 50% 40%, transparent 40%, rgba(0, 0, 0, 0.7) 100%);
    }

    .logo-wrap {
      padding: 10px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(201, 168, 76, 0.22), transparent 70%);
    }
    .logo-wrap img {
      filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.8));
    }
    .title {
      letter-spacing: 0.02em;
      text-shadow:
        0 0 24px rgba(201, 168, 76, 0.35),
        0 3px 0 rgba(0, 0, 0, 0.6);
      animation: neon 7s infinite;
    }
    .ornament {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--color-accent);
      opacity: 0.8;
    }
    .ornament .rule {
      width: 64px;
      height: 1px;
      background: linear-gradient(to right, transparent, var(--color-accent));
    }
    .ornament .rule:last-child {
      transform: scaleX(-1);
    }

    .case-file {
      filter: drop-shadow(0 18px 40px rgba(0, 0, 0, 0.65));
    }
    .case-tab {
      display: inline-block;
      margin-left: 18px;
      padding: 6px 16px 4px;
      font-size: 10px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--color-accent);
      background: var(--color-surface);
      border: 1px solid rgba(201, 168, 76, 0.35);
      border-bottom: none;
      border-radius: 6px 6px 0 0;
    }
    .case-body {
      position: relative;
      overflow: hidden;
      background:
        linear-gradient(160deg, rgba(201, 168, 76, 0.06), transparent 40%), var(--color-surface);
      border: 1px solid rgba(201, 168, 76, 0.35);
      border-radius: 0 8px 8px 8px;
    }
    .stamp {
      position: absolute;
      top: 16px;
      right: 14px;
      padding: 2px 10px;
      font-size: 10px;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      color: rgba(220, 70, 60, 0.55);
      border: 2px solid rgba(220, 70, 60, 0.45);
      border-radius: 3px;
      transform: rotate(12deg);
      pointer-events: none;
    }
    .saved-case {
      background: color-mix(in srgb, var(--color-surface) 88%, transparent);
      backdrop-filter: blur(4px);
      transition:
        transform 0.2s,
        border-color 0.2s;
    }
    .saved-case:hover {
      transform: translateY(-2px);
      border-color: rgba(201, 168, 76, 0.5) !important;
    }

    @keyframes rain {
      to {
        background-position: -40px 240px;
      }
    }
    @keyframes drift {
      from {
        transform: translateX(-12%);
      }
      to {
        transform: translateX(12%);
      }
    }
    @keyframes flicker {
      0%,
      100% {
        opacity: 0.85;
      }
      47% {
        opacity: 0.15;
      }
      52% {
        opacity: 0.85;
      }
    }
    @keyframes lampHum {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.8;
      }
    }
    @keyframes ember {
      0%,
      100% {
        opacity: 0.4;
      }
      50% {
        opacity: 1;
      }
    }
    @keyframes neon {
      0%,
      92%,
      100% {
        opacity: 1;
      }
      93% {
        opacity: 0.6;
      }
      94% {
        opacity: 1;
      }
      96% {
        opacity: 0.75;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .rain,
      .fog,
      .window,
      .lamp-cone,
      .ember,
      .title {
        animation: none;
      }
    }
    @media (max-width: 640px) {
      .moon {
        width: 70px;
        height: 70px;
        right: 8%;
      }
    }
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
  selectedStyleOption = SURPRISE_ME_OPTION;
  customStyle = '';

  readonly difficulties: Difficulty[] = ['easy', 'normal', 'hard', 'genius'];
  readonly artStyles = ART_STYLES;
  readonly customStyleOption = CUSTOM_STYLE_OPTION;
  readonly surpriseMeOption = SURPRISE_ME_OPTION;
  readonly styleOptions = [...ART_STYLES, SURPRISE_ME_OPTION, CUSTOM_STYLE_OPTION];

  readonly buildings = SKYLINE.buildings;
  readonly windows = SKYLINE.windows;
  readonly farSkyline = FAR_SKYLINE;
  readonly caseNumber = String(Math.floor(Math.random() * 9000) + 1000);

  ngOnInit(): void {
    this.loadSavedCases();
  }

  startNewCase(): void {
    const style =
      this.selectedStyleOption === SURPRISE_ME_OPTION
        ? SURPRISE_ME_OPTION
        : this.selectedStyleOption === CUSTOM_STYLE_OPTION
          ? this.customStyle.trim() || ART_STYLES[0]
          : this.selectedStyleOption;
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
