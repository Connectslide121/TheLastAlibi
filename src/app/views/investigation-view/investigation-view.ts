import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CaseStoreService } from '../../services/case-store.service';
import { GameStateService } from '../../services/game-state.service';
import { ThemeService } from '../../services/theme.service';
import {
  SuspectCardComponent,
  ClueCardComponent,
  DialogueBoxComponent,
  PuzzleFrameComponent,
  ActBannerComponent,
  ToastService,
} from '../../components';
import {
  CasePackage,
  InvestigationEvent,
  Suspect,
  Clue,
  PuzzleEvent,
  DialogueLine,
  Hint,
} from '../../models';

@Component({
  selector: 'app-investigation-view',
  standalone: true,
  imports: [
    SuspectCardComponent,
    ClueCardComponent,
    DialogueBoxComponent,
    PuzzleFrameComponent,
    ActBannerComponent,
  ],
  template: `
    <div class="min-h-screen flex flex-col bg-(--color-primary)">
      <!-- Top Bar -->
      <header
        class="fixed top-0 inset-x-0 z-50 flex items-center gap-4 px-6 py-3 bg-(--color-surface)"
        style="border-bottom: var(--border-style);"
      >
        <!-- Mobile sidebar toggle -->
        <button
          type="button"
          (click)="sidebarOpen.set(!sidebarOpen())"
          class="md:hidden p-1.5 rounded text-(--color-accent) hover:opacity-80 transition-opacity cursor-pointer"
          aria-label="Toggle suspects panel"
        >
          <span class="material-icons mi-md">menu</span>
        </button>
        <h1 class="font-heading text-lg text-(--color-accent) truncate flex-1">
          {{ casePackage()?.metadata?.title ?? 'The Last Alibi' }}
        </h1>
        <span class="hidden sm:inline font-mono text-sm text-(--color-text-muted)">
          Act {{ gameState()?.currentAct ?? 1 }} / 3
        </span>
        <span class="hidden sm:inline font-mono text-sm text-(--color-text-muted)">
          {{ gameState()?.actionsCount ?? 0 }} actions
        </span>
        <button
          type="button"
          (click)="caseFileOpen.set(true)"
          class="px-3 py-1.5 text-xs font-mono uppercase tracking-widest rounded cursor-pointer border border-(--color-accent) text-(--color-accent) hover:opacity-80 transition-opacity flex items-center gap-1"
        >
          <span class="material-icons mi-sm">folder_open</span>
          Case File
        </button>
        <button
          type="button"
          (click)="goToEvidenceBoard()"
          class="px-3 py-1.5 text-xs font-mono uppercase tracking-widest rounded cursor-pointer border border-(--color-accent) text-(--color-accent) hover:opacity-80 transition-opacity"
        >
          <span class="material-icons mi-sm">dashboard</span>
          Board
        </button>
      </header>

      <!-- Mobile sidebar backdrop -->
      @if (sidebarOpen()) {
        <div
          class="md:hidden fixed inset-0 z-30 bg-black/50"
          (click)="sidebarOpen.set(false)"
        ></div>
      }

      <!-- Main Layout -->
      <div class="pt-14 flex flex-1">
        <!-- Left Sidebar: Suspects + Progress + Hint -->
        <aside
          class="fixed md:relative z-40 top-14 md:top-auto bottom-0 md:bottom-auto w-64 shrink-0 flex flex-col gap-4 p-4 overflow-y-auto transition-transform duration-300 md:translate-x-0 bg-(--color-primary) md:bg-transparent"
          [class.-translate-x-full]="!sidebarOpen()"
          style="border-right: var(--border-style); min-height: calc(100vh - 3.5rem);"
        >
          <!-- Act Progress -->
          <div
            class="font-mono text-xs text-(--color-text-muted) uppercase tracking-widest flex items-center gap-1.5"
          >
            <span class="material-icons mi-sm">timeline</span>
            Act {{ gameState()?.currentAct ?? 1 }} Progress
          </div>
          <div class="h-1.5 rounded-full overflow-hidden bg-(--color-surface)">
            <div
              class="h-full rounded-full bg-(--color-accent) transition-all"
              [style.width]="actProgressPercent() + '%'"
            ></div>
          </div>

          <!-- Suspects -->
          <div
            class="font-mono text-xs text-(--color-text-muted) uppercase tracking-widest mt-2 flex items-center gap-1.5"
          >
            <span class="material-icons mi-sm">people</span>
            Suspects ({{ unlockedSuspects().length }})
          </div>
          @if (unlockedSuspects().length === 0) {
            <p class="text-xs text-(--color-text-muted) italic">No suspects unlocked yet.</p>
          }
          @for (suspect of unlockedSuspects(); track suspect.id) {
            <app-suspect-card
              [suspect]="suspect"
              [isInterviewed]="isInterviewed(suspect.id)"
              (cardClicked)="onSuspectClicked(suspect)"
            />
          }

          <!-- Hint Button -->
          <button
            type="button"
            (click)="useHint()"
            [disabled]="!hasMoreHints()"
            class="mt-auto w-full py-2 px-3 text-xs font-mono uppercase tracking-widest rounded border cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-80 transition-opacity"
            style="border-color: var(--color-accent); color: var(--color-accent);"
          >
            <span class="material-icons mi-sm">lightbulb</span>
            Use Hint ({{ hintsRemaining() }} left)
          </button>
        </aside>

        <!-- Main Content Area -->
        <main class="flex-1 flex flex-col p-6 overflow-y-auto">
          @if (isLoading()) {
            <div class="flex-1 flex items-center justify-center">
              <p class="text-(--color-text-muted) animate-pulse font-mono">Loading case…</p>
            </div>
          } @else if (activeDialogueLines().length > 0) {
            <!-- Dialogue Mode -->
            <div class="mb-4">
              <h2 class="font-heading text-xl text-(--color-accent) mb-1">
                {{ selectedEvent()?.title }}
              </h2>
              <p class="text-sm text-(--color-text-muted)">{{ activeSuspect()?.name }}</p>
            </div>
            <app-dialogue-box
              [lines]="activeDialogueLines()"
              (dialogueClosed)="onDialogueClosed()"
            />
          } @else if (activePuzzle()) {
            <!-- Puzzle Mode -->
            <div class="mb-4">
              <h2 class="font-heading text-xl text-(--color-accent)">
                {{ selectedEvent()?.title }}
              </h2>
            </div>
            <app-puzzle-frame
              [puzzle]="activePuzzle()!"
              [rewardClue]="activePuzzleRewardClue()"
              (puzzleSolved)="onPuzzleSolved($event)"
            />
          } @else if (selectedEvent()) {
            <!-- Narration / Investigation Mode -->
            <div class="max-w-2xl">
              <h2 class="font-heading text-2xl text-(--color-accent) mb-3">
                {{ selectedEvent()!.title }}
              </h2>
              <p class="text-(--color-text) leading-relaxed mb-6 font-body">
                {{ selectedEvent()!.narration }}
              </p>
              @if (recentClues().length > 0) {
                <div class="mb-6">
                  <h3
                    class="font-mono text-xs uppercase text-(--color-text-muted) tracking-widest mb-3"
                  >
                    <span class="material-icons mi-sm">article</span>
                    Evidence Found
                  </h3>
                  <div class="flex flex-col gap-3">
                    @for (clue of recentClues(); track clue.id) {
                      <app-clue-card [clue]="clue" [showTruth]="false" />
                    }
                  </div>
                </div>
              }
              <button
                type="button"
                (click)="finishNarration()"
                class="px-6 py-2.5 rounded border font-mono uppercase tracking-widest text-sm cursor-pointer hover:opacity-80 transition-opacity"
                style="border-color: var(--color-accent); color: var(--color-accent);"
              >
                <span class="material-icons mi-sm">arrow_forward</span>
                Continue
              </button>
            </div>
          } @else {
            <!-- Event Selection -->
            <h2 class="font-heading text-xl text-(--color-accent) mb-4">
              What would you like to investigate?
            </h2>
            @if (availableEvents().length === 0) {
              <p class="text-(--color-text-muted) italic mb-4">
                No leads available right now. Continue investigating to unlock more.
              </p>
            }
            <div class="grid grid-cols-1 gap-4 max-w-2xl">
              @for (event of availableEvents(); track event.id) {
                <button
                  type="button"
                  (click)="selectEvent(event)"
                  class="text-left p-4 rounded-lg border cursor-pointer transition-all hover:scale-[1.01] hover:opacity-90"
                  style="background: var(--color-secondary); border-color: rgba(201,168,76,0.3);"
                >
                  <div class="flex items-start gap-3">
                    <span class="material-icons mi-lg text-(--color-accent) opacity-70">{{
                      categoryIcon(event.category)
                    }}</span>
                    <div class="flex-1">
                      <h3 class="font-heading text-(--color-accent) mb-0.5">{{ event.title }}</h3>
                      <p class="text-sm text-(--color-text) opacity-80">{{ event.description }}</p>
                      @if (event.isMandatory) {
                        <span
                          class="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 text-xs font-mono rounded"
                          style="border: 1px solid rgba(251,191,36,0.5); color: rgb(251,191,36);"
                        >
                          <span class="material-icons mi-sm">star</span>
                          Required
                        </span>
                      }
                    </div>
                  </div>
                </button>
              }
            </div>

            <!-- Accusation Button -->
            @if (isAccusationUnlocked()) {
              <div class="mt-8">
                <button
                  type="button"
                  (click)="goAccuse()"
                  class="px-8 py-3 rounded font-mono uppercase tracking-widest text-sm cursor-pointer hover:opacity-80 transition-opacity"
                  style="border: 1px solid rgb(185,28,28); background: rgba(127,29,29,0.3); color: rgb(252,165,165);"
                >
                  <span class="material-icons mi-sm">gavel</span>
                  Make Your Accusation
                </button>
              </div>
            }
          }
        </main>

        <!-- Right Panel: Evidence -->
        <aside
          class="w-56 shrink-0 flex flex-col gap-3 p-4 overflow-y-auto"
          style="border-left: var(--border-style); min-height: calc(100vh - 3.5rem);"
        >
          <div
            class="font-mono text-xs text-(--color-text-muted) uppercase tracking-widest flex items-center gap-1.5"
          >
            <span class="material-icons mi-sm">inventory_2</span>
            Evidence ({{ foundClues().length }})
          </div>
          @if (foundClues().length === 0) {
            <p class="text-xs text-(--color-text-muted) italic">No evidence found yet.</p>
          }
          @for (clue of foundClues(); track clue.id) {
            <app-clue-card [clue]="clue" [showTruth]="false" />
          }
        </aside>
      </div>

      <!-- Hint Modal Overlay -->
      @if (activeHint()) {
        <div
          class="fixed inset-0 z-60 flex items-center justify-center p-6"
          style="background: rgba(0,0,0,0.75);"
          (click)="dismissHint()"
        >
          <div
            class="fade-in w-full max-w-md rounded-lg p-8 flex flex-col gap-5 shadow-2xl"
            style="background: var(--color-surface); border: var(--border-style);"
            (click)="$event.stopPropagation()"
          >
            <div class="flex items-center gap-3">
              <span class="material-icons mi-xl text-(--color-accent) shrink-0">psychology</span>
              <h3 class="font-heading text-(--color-accent) text-xl font-semibold">
                Detective's Hint
              </h3>
            </div>
            <p class="font-body text-(--color-text) text-base leading-relaxed">
              {{ activeHint()!.text }}
            </p>
            @if (activeHint()!.targetsEventId) {
              <p class="font-mono text-xs text-(--color-text-muted) italic">
                This hint relates to: {{ activeHint()!.targetsEventId }}
              </p>
            }
            <div
              class="flex items-center justify-between pt-4 border-t"
              style="border-color: rgba(201,168,76,0.2);"
            >
              <span class="font-mono text-xs text-(--color-text-muted)">
                {{ hintsRemaining() }} hint{{ hintsRemaining() === 1 ? '' : 's' }} remaining
              </span>
              <button
                type="button"
                (click)="dismissHint()"
                class="px-4 py-1.5 text-xs font-mono uppercase tracking-widest rounded border cursor-pointer hover:opacity-80 transition-opacity"
                style="border-color: var(--color-accent); color: var(--color-accent);"
              >
                <span class="material-icons mi-sm">check</span>
                Got it
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Act Banner Overlay -->
      @if (showActBanner()) {
        <app-act-banner
          [act]="currentActForBanner()"
          [title]="actBannerTitle()"
          [summary]="actBannerSummary()"
          (dismissed)="onActBannerDismissed()"
        />
      }

      <!-- ===== Case File Drawer ===== -->
      @if (caseFileOpen()) {
        <!-- Backdrop -->
        <div class="fixed inset-0 z-60 bg-black/60" (click)="caseFileOpen.set(false)"></div>

        <!-- Drawer panel -->
        <div
          class="fixed right-0 top-0 bottom-0 z-70 w-full max-w-lg flex flex-col"
          style="background: var(--color-secondary); border-left: var(--border-style); animation: drawerIn 0.25s ease both"
          (click)="$event.stopPropagation()"
        >
          <!-- Drawer header -->
          <div
            class="flex items-center gap-3 px-5 py-4 shrink-0"
            style="border-bottom: var(--border-style)"
          >
            <span class="material-icons" style="color: var(--color-accent)">folder_open</span>
            <h2 class="font-heading text-lg flex-1" style="color: var(--color-accent)">
              Case File
            </h2>
            <button
              type="button"
              (click)="caseFileOpen.set(false)"
              class="p-1.5 rounded opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
              style="color: var(--color-text)"
            >
              <span class="material-icons">close</span>
            </button>
          </div>

          <!-- Tabs -->
          <div class="flex shrink-0 px-5 gap-1 pt-3" style="border-bottom: var(--border-style)">
            @for (tab of caseFileTabs; track tab.id) {
              <button
                type="button"
                (click)="caseFileTab.set(tab.id)"
                class="flex items-center gap-1.5 px-3 py-2 font-mono text-xs uppercase tracking-widest cursor-pointer transition-all border-b-2 -mb-px"
                [style.border-bottom-color]="
                  caseFileTab() === tab.id ? 'var(--color-accent)' : 'transparent'
                "
                [style.color]="
                  caseFileTab() === tab.id ? 'var(--color-accent)' : 'var(--color-text-muted)'
                "
              >
                <span class="material-icons" style="font-size: 0.95rem">{{ tab.icon }}</span>
                {{ tab.label }}
              </button>
            }
          </div>

          <!-- Tab content -->
          <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
            <!-- BRIEFING TAB -->
            @if (caseFileTab() === 'briefing') {
              <div class="flex flex-col gap-5">
                <div class="flex flex-col gap-1">
                  <span
                    class="font-mono text-xs uppercase tracking-widest"
                    style="color: var(--color-text-muted)"
                    >{{ casePackage()?.metadata?.caseType }}</span
                  >
                  <h3 class="font-heading text-2xl" style="color: var(--color-accent)">
                    {{ casePackage()?.metadata?.title }}
                  </h3>
                  @if (casePackage()?.metadata?.subtitle) {
                    <p class="font-mono text-sm" style="color: var(--color-text-muted)">
                      {{ casePackage()?.metadata?.subtitle }}
                    </p>
                  }
                </div>
                <div class="flex items-center gap-2">
                  <span class="material-icons" style="font-size: 1rem; color: var(--color-accent)"
                    >location_on</span
                  >
                  <span class="font-mono text-sm" style="color: var(--color-text-muted)">
                    {{ casePackage()?.metadata?.setting }}
                  </span>
                </div>
                <div
                  class="rounded-lg p-4"
                  style="background: var(--color-surface); border: var(--border-style)"
                >
                  <p
                    class="font-mono text-xs uppercase tracking-widest mb-3 flex items-center gap-1.5"
                    style="color: var(--color-accent)"
                  >
                    <span class="material-icons" style="font-size: 0.9rem">description</span>
                    Briefing
                  </p>
                  <p
                    class="text-sm leading-relaxed"
                    style="font-family: var(--font-body); color: var(--color-text)"
                  >
                    {{ casePackage()?.metadata?.briefing }}
                  </p>
                </div>
                <div class="flex flex-col gap-3">
                  @for (act of briefingActPreviews(); track act.label) {
                    <div
                      class="rounded-lg p-4"
                      style="background: var(--color-surface); border: var(--border-style)"
                    >
                      <p
                        class="font-mono text-xs uppercase tracking-widest mb-1.5"
                        style="color: var(--color-accent)"
                      >
                        {{ act.label }}
                      </p>
                      <p
                        class="text-sm leading-relaxed"
                        style="font-family: var(--font-body); color: var(--color-text); opacity: 0.8"
                      >
                        {{ act.summary }}
                      </p>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- EVIDENCE TAB -->
            @if (caseFileTab() === 'evidence') {
              @if (foundClues().length === 0) {
                <div class="flex flex-col items-center gap-3 py-12 opacity-50">
                  <span class="material-icons text-5xl" style="color: var(--color-text-muted)"
                    >search_off</span
                  >
                  <p class="font-mono text-sm" style="color: var(--color-text-muted)">
                    No evidence collected yet.
                  </p>
                </div>
              }
              @for (clue of foundClues(); track clue.id) {
                <div
                  class="rounded-lg p-4 flex flex-col gap-2"
                  style="background: var(--color-surface); border: var(--border-style)"
                >
                  <div class="flex items-start gap-2">
                    <span
                      class="material-icons shrink-0 mt-0.5"
                      style="font-size: 1rem; color: var(--color-accent)"
                      >article</span
                    >
                    <div class="flex flex-col gap-1 flex-1">
                      <span class="font-heading text-base" style="color: var(--color-accent)">{{
                        clue.name
                      }}</span>
                      <p
                        class="text-sm leading-relaxed"
                        style="font-family: var(--font-body); color: var(--color-text)"
                      >
                        {{ clue.description }}
                      </p>
                      <p class="text-xs italic mt-1" style="color: var(--color-text-muted)">
                        <span
                          class="material-icons"
                          style="font-size: 0.8rem; vertical-align: middle"
                          >lightbulb</span
                        >
                        {{ clue.revealsInfo }}
                      </p>
                      <p class="font-mono text-xs mt-1" style="color: var(--color-text-muted)">
                        Found at: {{ clueLocationName(clue.locationId) }}
                      </p>
                    </div>
                  </div>
                </div>
              }
            }

            <!-- SUSPECTS TAB -->
            @if (caseFileTab() === 'suspects') {
              @if (unlockedSuspects().length === 0) {
                <div class="flex flex-col items-center gap-3 py-12 opacity-50">
                  <span class="material-icons text-5xl" style="color: var(--color-text-muted)"
                    >person_off</span
                  >
                  <p class="font-mono text-sm" style="color: var(--color-text-muted)">
                    No suspects identified yet.
                  </p>
                </div>
              }
              @for (suspect of unlockedSuspects(); track suspect.id) {
                <div
                  class="rounded-lg p-4 flex flex-col gap-3"
                  style="background: var(--color-surface); border: var(--border-style)"
                >
                  <div class="flex items-start gap-3">
                    <!-- Portrait placeholder -->
                    <div
                      class="w-12 h-12 rounded-full shrink-0 flex items-center justify-center"
                      style="background: var(--color-secondary); border: var(--border-style)"
                    >
                      <span class="material-icons" style="color: var(--color-accent)">person</span>
                    </div>
                    <div class="flex flex-col gap-0.5 flex-1">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-heading text-lg" style="color: var(--color-accent)">{{
                          suspect.name
                        }}</span>
                        @if (isInterviewed(suspect.id)) {
                          <span
                            class="font-mono text-xs px-2 py-0.5 rounded-full"
                            style="background: rgba(201,168,76,0.15); color: var(--color-accent); border: 1px solid rgba(201,168,76,0.3)"
                            >Interviewed</span
                          >
                        }
                      </div>
                      <p class="font-mono text-xs" style="color: var(--color-text-muted)">
                        {{ suspect.age }} · {{ suspect.occupation }}
                      </p>
                    </div>
                  </div>
                  <p
                    class="text-sm leading-relaxed"
                    style="font-family: var(--font-body); color: var(--color-text)"
                  >
                    {{ suspect.description }}
                  </p>
                  <div
                    class="rounded p-3 flex flex-col gap-1"
                    style="background: var(--color-secondary)"
                  >
                    <span
                      class="font-mono text-xs uppercase tracking-widest"
                      style="color: var(--color-text-muted)"
                      >Relationship</span
                    >
                    <p class="text-xs" style="color: var(--color-text)">
                      {{ suspect.relationship }}
                    </p>
                  </div>
                  @if (isInterviewed(suspect.id)) {
                    <div
                      class="rounded p-3 flex flex-col gap-1"
                      style="background: var(--color-secondary)"
                    >
                      <span
                        class="font-mono text-xs uppercase tracking-widest"
                        style="color: var(--color-text-muted)"
                        >Stated Alibi</span
                      >
                      <p class="text-xs" style="color: var(--color-text)">{{ suspect.alibi }}</p>
                    </div>
                  }
                </div>
              }
            }

            <!-- TIMELINE TAB -->
            @if (caseFileTab() === 'timeline') {
              @if ((casePackage()?.timeline ?? []).length === 0) {
                <div class="flex flex-col items-center gap-3 py-12 opacity-50">
                  <span class="material-icons text-5xl" style="color: var(--color-text-muted)"
                    >schedule</span
                  >
                  <p class="font-mono text-sm" style="color: var(--color-text-muted)">
                    Timeline not yet available.
                  </p>
                </div>
              }
              <div class="flex flex-col gap-0">
                @for (event of casePackage()?.timeline ?? []; track event.id; let last = $last) {
                  <div class="flex gap-3">
                    <!-- Timeline spine -->
                    <div class="flex flex-col items-center shrink-0">
                      <div
                        class="w-3 h-3 rounded-full mt-1 shrink-0"
                        style="background: var(--color-accent)"
                      ></div>
                      @if (!last) {
                        <div
                          class="w-px flex-1 my-1"
                          style="background: rgba(201,168,76,0.25)"
                        ></div>
                      }
                    </div>
                    <!-- Event content -->
                    <div class="flex flex-col gap-1 pb-5">
                      <span class="font-mono text-xs" style="color: var(--color-accent)">{{
                        event.time
                      }}</span>
                      <p
                        class="text-sm leading-relaxed"
                        style="font-family: var(--font-body); color: var(--color-text)"
                      >
                        {{ event.description }}
                      </p>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }

      <style>
        @keyframes drawerIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      </style>
    </div>
  `,
})
export class InvestigationView implements OnInit {
  private readonly router = inject(Router);
  private readonly caseStore = inject(CaseStoreService);
  private readonly gsvc = inject(GameStateService);
  private readonly theme = inject(ThemeService);
  private readonly toast = inject(ToastService);

  readonly isLoading = signal(true);
  readonly casePackage = signal<CasePackage | null>(null);
  readonly selectedEvent = signal<InvestigationEvent | null>(null);
  readonly activeDialogueLines = signal<DialogueLine[]>([]);
  readonly showActBanner = signal(false);
  readonly actBannerTitle = signal('');
  readonly actBannerSummary = signal('');
  readonly currentActForBanner = signal<1 | 2 | 3>(1);
  readonly recentClueIds = signal<string[]>([]);
  readonly sidebarOpen = signal(true);
  readonly activeHint = signal<Hint | null>(null);
  readonly caseFileOpen = signal(false);
  readonly caseFileTab = signal<'briefing' | 'evidence' | 'suspects' | 'timeline'>('briefing');

  readonly gameState = this.gsvc.state;
  readonly isAccusationUnlocked = this.gsvc.isAccusationUnlocked;

  readonly availableEvents = computed((): InvestigationEvent[] => {
    const pkg = this.casePackage();
    const state = this.gameState();
    if (!pkg || !state) return [];
    return this.gsvc.getAvailableEvents(pkg, state);
  });

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

  readonly activeSuspect = computed((): Suspect | null => {
    const event = this.selectedEvent();
    if (!event?.dialogueSuspectId) return null;
    return this.casePackage()?.suspects.find((s) => s.id === event.dialogueSuspectId) ?? null;
  });

  readonly activePuzzle = computed((): PuzzleEvent | null => {
    const event = this.selectedEvent();
    if (!event?.puzzleId) return null;
    return this.casePackage()?.puzzles.find((p) => p.id === event.puzzleId) ?? null;
  });

  readonly activePuzzleRewardClue = computed((): Clue | null => {
    const puzzle = this.activePuzzle();
    if (!puzzle?.rewardedClueId) return null;
    return this.casePackage()?.clues.find((c) => c.id === puzzle.rewardedClueId) ?? null;
  });

  readonly recentClues = computed((): Clue[] => {
    const ids = this.recentClueIds();
    const pkg = this.casePackage();
    if (!pkg) return [];
    return pkg.clues.filter((c) => ids.includes(c.id));
  });

  readonly actProgressPercent = computed((): number => {
    const pkg = this.casePackage();
    const state = this.gameState();
    if (!pkg || !state) return 0;
    const mandatory = pkg.eventGraph.filter((e) => e.act === state.currentAct && e.isMandatory);
    if (mandatory.length === 0) return 100;
    const done = mandatory.filter((e) => state.completedEventIds.includes(e.id)).length;
    return Math.round((done / mandatory.length) * 100);
  });

  readonly hintsRemaining = computed((): number => {
    const pkg = this.casePackage();
    const state = this.gameState();
    if (!pkg || !state) return 0;
    return Math.max(0, pkg.hintLadder.length - state.hintsUsed);
  });

  readonly hasMoreHints = computed(() => this.hintsRemaining() > 0);

  readonly caseFileTabs = [
    { id: 'briefing' as const, label: 'Briefing', icon: 'description' },
    { id: 'evidence' as const, label: 'Evidence', icon: 'inventory_2' },
    { id: 'suspects' as const, label: 'Suspects', icon: 'people' },
    { id: 'timeline' as const, label: 'Timeline', icon: 'schedule' },
  ];

  readonly briefingActPreviews = computed(() => {
    const m = this.casePackage()?.metadata;
    if (!m) return [];
    return [
      { label: 'Act I', summary: m.act1Summary },
      { label: 'Act II', summary: m.act2Summary },
      { label: 'Act III', summary: m.act3Summary },
    ];
  });

  clueLocationName(locationId: string): string {
    return this.casePackage()?.locations.find((l) => l.id === locationId)?.name ?? locationId;
  }

  ngOnInit(): void {
    // getCurrentNavigation() is only available during the navigation itself.
    // After navigation completes (e.g. page reload or back-navigation) the
    // router writes its state into history.state, so we read from there too.
    const routerState = (this.router.getCurrentNavigation()?.extras?.state ??
      (window.history.state as Record<string, unknown>)) as { sessionId?: string } | undefined;
    const sessionId = routerState?.sessionId ?? this.gsvc.state()?.sessionId;

    if (!sessionId) {
      void this.router.navigate(['/']);
      return;
    }

    // Load or resume game state first
    if (!this.gsvc.state() || this.gsvc.state()?.sessionId !== sessionId) {
      this.gsvc.loadState(sessionId);
    }

    this.caseStore.loadCase(sessionId).subscribe((pkg) => {
      if (!pkg) {
        void this.router.navigate(['/']);
        return;
      }
      this.casePackage.set(pkg);
      this.theme.applyTheme(pkg.uiTheme);
      this.theme.applyTexture(pkg.uiTheme.textureFamily);
      this.isLoading.set(false);
    });
  }

  selectEvent(event: InvestigationEvent): void {
    this.selectedEvent.set(event);
    this.recentClueIds.set([]);

    if (event.dialogueSuspectId) {
      const suspect = this.casePackage()?.suspects.find((s) => s.id === event.dialogueSuspectId);
      if (suspect) {
        this.activeDialogueLines.set(suspect.interviewDialogue);
        this.gsvc.interviewSuspect(event.dialogueSuspectId);
      }
    } else if (event.category !== 'puzzle') {
      this.activeDialogueLines.set([]);
    }
  }

  onDialogueClosed(): void {
    const event = this.selectedEvent();
    if (event) this.completeCurrentEvent(event);
    this.activeDialogueLines.set([]);
    this.selectedEvent.set(null);
  }

  onPuzzleSolved(clueId: string): void {
    const event = this.selectedEvent();
    if (event) {
      if (clueId) this.gsvc.discoverClue(clueId);
      this.completeCurrentEvent(event);
    }
    this.selectedEvent.set(null);
  }

  finishNarration(): void {
    const event = this.selectedEvent();
    if (event) this.completeCurrentEvent(event);
    this.recentClueIds.set([]);
    this.selectedEvent.set(null);
  }

  onSuspectClicked(suspect: Suspect): void {
    const available = this.availableEvents().find(
      (e) => e.dialogueSuspectId === suspect.id && e.category === 'social',
    );
    if (available) {
      this.selectEvent(available);
    } else {
      this.toast.show(`Nothing new to ask ${suspect.name} right now.`, 'info');
    }
  }

  useHint(): void {
    const pkg = this.casePackage();
    const state = this.gameState();
    if (!pkg || !state || !this.hasMoreHints()) return;
    const hint = pkg.hintLadder[state.hintsUsed];
    if (hint) {
      this.gsvc.useHint();
      // Brief delay builds tension before revealing the hint
      setTimeout(() => this.activeHint.set(hint), 400);
    }
  }

  dismissHint(): void {
    this.activeHint.set(null);
  }

  goAccuse(): void {
    void this.router.navigate(['/accusation']);
  }

  goToEvidenceBoard(): void {
    void this.router.navigate(['/evidence-board']);
  }

  onActBannerDismissed(): void {
    this.showActBanner.set(false);
  }

  isInterviewed(suspectId: string): boolean {
    return this.gameState()?.interviewedSuspectIds.includes(suspectId) ?? false;
  }

  categoryIcon(category: InvestigationEvent['category']): string {
    const icons: Record<InvestigationEvent['category'], string> = {
      investigation: 'search',
      social: 'record_voice_over',
      surprise: 'bolt',
      puzzle: 'extension',
      deduction: 'track_changes',
    };
    return icons[category] ?? 'folder';
  }

  private completeCurrentEvent(event: InvestigationEvent): void {
    this.gsvc.completeEvent(event.id);

    const clueIds: string[] = [];
    event.rewardsClueIds.forEach((id) => {
      this.gsvc.discoverClue(id);
      clueIds.push(id);
    });
    event.unlocksSuspectIds.forEach((id) => this.gsvc.unlockSuspect(id));

    if (clueIds.length > 0) {
      this.recentClueIds.set(clueIds);
    }

    this.checkActProgression();
  }

  private checkActProgression(): void {
    const pkg = this.casePackage();
    const state = this.gsvc.state();
    if (!pkg || !state) return;

    const currentAct = state.currentAct;

    if (currentAct === 3 && !state.isAccusationUnlocked) {
      const act3Mandatory = pkg.eventGraph.filter((e) => e.act === 3 && e.isMandatory);
      const completedCount = act3Mandatory.filter((e) =>
        state.completedEventIds.includes(e.id),
      ).length;
      if (act3Mandatory.length === 0 || completedCount >= Math.ceil(act3Mandatory.length / 2)) {
        this.gsvc.unlockAccusation();
      }
      return;
    }

    if (currentAct >= 3) return;

    const mandatory = pkg.eventGraph.filter((e) => e.act === currentAct && e.isMandatory);
    const allDone =
      mandatory.length > 0 && mandatory.every((e) => state.completedEventIds.includes(e.id));

    if (allDone) {
      this.gsvc.advanceAct();
      const newAct = (currentAct + 1) as 1 | 2 | 3;
      this.currentActForBanner.set(newAct);

      const actSummaries: Record<number, string> = {
        2: pkg.metadata.act2Summary,
        3: pkg.metadata.act3Summary,
      };
      const actTitles: Record<number, string> = {
        2: 'Act II: Deeper Lies',
        3: 'Act III: The Final Deduction',
      };

      this.actBannerTitle.set(actTitles[newAct] ?? `Act ${newAct}`);
      this.actBannerSummary.set(actSummaries[newAct] ?? '');
      this.showActBanner.set(true);

      if (newAct === 3) {
        this.gsvc.unlockAccusation();
      }
    }
  }
}
