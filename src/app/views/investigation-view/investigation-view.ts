import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CaseStoreService } from '../../services/case-store.service';
import { DebugTraceService } from '../../services/debug-trace.service';
import { GameStateService } from '../../services/game-state.service';
import { ThemeService } from '../../services/theme.service';
import { ImageService } from '../../services/image.service';
import { InterviewService, InterviewChatMessage } from '../../services/interview.service';
import { repairEventGraph } from '../../utils/event-graph-repair';
import {
  SuspectCardComponent,
  ClueCardComponent,
  DialogueBoxComponent,
  PuzzleFrameComponent,
  ActBannerComponent,
  DebugDashboardComponent,
  ToastService,
  LocationCardComponent,
  InterviewChatComponent,
  StyleConfigComponent,
} from '../../components';
import {
  CasePackage,
  InvestigationEvent,
  ExaminationSpot,
  Suspect,
  Clue,
  PuzzleEvent,
  DialogueLine,
  Hint,
  Location as GameLocation,
} from '../../models';

type UnlockSpotlight = { kind: 'clue'; clue: Clue } | { kind: 'suspect'; suspect: Suspect };
type CaseFileImageLightbox = {
  url: string;
  alt: string;
  title: string;
  caption: string;
};

@Component({
  selector: 'app-investigation-view',
  standalone: true,
  imports: [
    SuspectCardComponent,
    ClueCardComponent,
    DialogueBoxComponent,
    PuzzleFrameComponent,
    ActBannerComponent,
    DebugDashboardComponent,
    LocationCardComponent,
    InterviewChatComponent,
    StyleConfigComponent,
  ],
  template: `
    <div class="h-screen flex flex-col bg-(--color-primary)">
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
        <button
          type="button"
          (click)="goHome()"
          class="px-3 py-1.5 text-xs font-mono uppercase tracking-widest rounded cursor-pointer border hover:opacity-80 transition-opacity flex items-center gap-1"
          style="border-color: rgba(255,255,255,0.2); color: var(--color-text-muted)"
          title="Exit to home"
        >
          <span class="material-icons mi-sm">home</span>
        </button>
        <button
          type="button"
          (click)="debugDashboardOpen.set(true)"
          class="px-3 py-1.5 text-xs font-mono uppercase tracking-widest rounded cursor-pointer border hover:opacity-80 transition-opacity flex items-center gap-1"
          style="border-color: rgba(255,255,255,0.2); color: var(--color-text-muted)"
          title="Open debug dashboard"
        >
          <span class="material-icons mi-sm">bug_report</span>
          Debug
        </button>
        <button
          type="button"
          (click)="styleConfigOpen.set(true)"
          class="px-3 py-1.5 text-xs font-mono uppercase tracking-widest rounded cursor-pointer border hover:opacity-80 transition-opacity flex items-center gap-1"
          style="border-color: rgba(255,255,255,0.2); color: var(--color-text-muted)"
          title="Customize styles"
        >
          <span class="material-icons mi-sm">palette</span>
          Styles
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
      <div class="pt-14 flex flex-1 min-h-0">
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
            <p class="text-xs text-(--color-text-muted) italic">No suspects in this case.</p>
          }
          @for (suspect of unlockedSuspects(); track suspect.id) {
            <app-suspect-card
              [suspect]="suspect"
              [isInterviewed]="isInterviewed(suspect.id)"
              [variant]="'compact'"
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
            <div class="mb-4 shrink-0 flex items-center gap-3">
              <button
                type="button"
                (click)="selectedEvent.set(null)"
                class="flex items-center gap-1 px-2 py-1 rounded font-mono text-xs uppercase tracking-widest cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                style="color: var(--color-text-muted); border: 1px solid rgba(255,255,255,0.12)"
              >
                <span class="material-icons" style="font-size: 0.9rem">arrow_back</span>
                Back
              </button>
              <h2 class="font-heading text-xl text-(--color-accent)">
                {{ selectedEvent()?.title }}
              </h2>
            </div>
            <app-puzzle-frame
              class="flex-1 min-h-0"
              [puzzle]="activePuzzle()!"
              [rewardClue]="activePuzzleRewardClue()"
              (puzzleSolved)="onPuzzleSolved($event)"
            />
          } @else if (activeInterviewSuspect() && casePackage()) {
            <!-- Interview Chat Mode -->
            <app-interview-chat
              class="flex-1 min-h-0 block"
              [suspect]="activeInterviewSuspect()!"
              [casePackage]="casePackage()!"
              [foundClues]="foundClues()"
              [sessionId]="gameState()?.sessionId ?? ''"
              [revisitTranscript]="revisitInterviewTranscript()"
              (interviewClosed)="onInterviewClosed()"
            />
          } @else if (selectedEvent()) {
            <!-- Searchable Room / Narration Mode -->
            <div class="max-w-2xl w-full">
              <h2 class="font-heading text-2xl text-(--color-accent) mb-3">
                {{ selectedEvent()!.title }}
              </h2>
              <p class="text-(--color-text) leading-relaxed mb-6 font-body italic">
                {{ selectedEvent()!.narration }}
              </p>

              @if (activeExaminationSpots().length > 0) {
                <!-- Spot grid -->
                <div class="mb-6">
                  <p
                    class="font-mono text-xs uppercase tracking-widest text-(--color-text-muted) mb-3"
                  >
                    <span class="material-icons mi-sm">search</span>
                    Examine the scene
                  </p>
                  <div class="grid grid-cols-2 gap-3">
                    @for (spot of activeExaminationSpots(); track spot.id) {
                      <button
                        type="button"
                        (click)="examineSpot(spot)"
                        class="text-left p-3 rounded-lg border cursor-pointer transition-all hover:scale-[1.01]"
                        [class.opacity-50]="
                          examinedSpotIds().includes(spot.id) && !spot.rewardsClueId
                        "
                        [style.border-color]="
                          activeSpot()?.id === spot.id
                            ? 'var(--color-accent)'
                            : 'rgba(255,255,255,0.15)'
                        "
                        [style.background]="
                          activeSpot()?.id === spot.id ? 'rgba(255,255,255,0.07)' : 'transparent'
                        "
                      >
                        <div class="flex items-center gap-2 mb-1">
                          <span class="material-icons mi-sm text-(--color-accent)">
                            {{
                              examinedSpotIds().includes(spot.id)
                                ? spot.rewardsClueId
                                  ? 'check_circle'
                                  : 'radio_button_checked'
                                : 'radio_button_unchecked'
                            }}
                          </span>
                          <span
                            class="font-mono text-xs uppercase tracking-wider text-(--color-accent)"
                          >
                            {{ spot.label }}
                          </span>
                        </div>
                      </button>
                    }
                  </div>
                </div>

                <!-- Active spot detail panel -->
                @if (activeSpot()) {
                  <div
                    class="mb-6 p-4 rounded-lg border"
                    style="border-color: var(--color-accent); background: rgba(255,255,255,0.04);"
                  >
                    <h3
                      class="font-mono text-sm uppercase tracking-widest text-(--color-accent) mb-2"
                    >
                      <span class="material-icons mi-sm">manage_search</span>
                      {{ activeSpot()!.label }}
                    </h3>
                    <p class="text-(--color-text) leading-relaxed font-body mb-3">
                      {{ activeSpot()!.description }}
                    </p>
                    @if (activeSpot()!.rewardsClueId) {
                      @let spotClue = getClueById(activeSpot()!.rewardsClueId!);
                      @if (spotClue) {
                        <div class="mt-3">
                          <p
                            class="font-mono text-xs uppercase tracking-widest text-(--color-text-muted) mb-2"
                          >
                            <span class="material-icons mi-sm">article</span>
                            Evidence discovered
                          </p>
                          <app-clue-card [clue]="spotClue" [showTruth]="false" />
                        </div>
                      }
                    }
                  </div>
                }

                <!-- Leave scene button -->
                <button
                  type="button"
                  (click)="finishNarration()"
                  [disabled]="!canLeaveScene()"
                  class="px-6 py-2.5 rounded border font-mono uppercase tracking-widest text-sm transition-opacity"
                  [class.cursor-pointer]="canLeaveScene()"
                  [class.cursor-not-allowed]="!canLeaveScene()"
                  [class.opacity-40]="!canLeaveScene()"
                  [class.hover:opacity-80]="canLeaveScene()"
                  style="border-color: var(--color-accent); color: var(--color-accent);"
                >
                  <span class="material-icons mi-sm">exit_to_app</span>
                  @if (canLeaveScene()) {
                    Leave the scene
                  } @else {
                    Find the evidence first
                  }
                </button>
              } @else {
                <!-- Fallback: no spots, show old narration + continue -->
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
                        <button
                          type="button"
                          class="w-full text-left cursor-pointer hover:opacity-90 transition-opacity"
                          (click)="onClueClicked(clue)"
                        >
                          <app-clue-card [clue]="clue" [showTruth]="false" />
                        </button>
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
              }
            </div>
          } @else {
            <!-- Event Selection -->
            <h2 class="font-heading text-xl text-(--color-accent) mb-4">
              What would you like to investigate?
            </h2>
            @if (currentActEvents().length === 0 && lingeringEvents().length === 0) {
              <p class="text-(--color-text-muted) italic mb-4">
                No leads available right now. Continue investigating to unlock more.
              </p>
            }
            @if (currentActEvents().length > 0) {
              <div class="max-w-2xl mb-6">
                <p
                  class="font-mono text-xs uppercase tracking-widest mb-3"
                  style="color: var(--color-text-muted)"
                >
                  Current Act Leads
                </p>
                <div class="grid grid-cols-1 gap-4">
                  @for (event of currentActEvents(); track event.id) {
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
                          <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="font-heading text-(--color-accent) mb-0.5">
                              {{ event.title }}
                            </h3>
                            @if (event.isMandatory) {
                              <span
                                class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded"
                                style="border: 1px solid rgba(251,191,36,0.5); color: rgb(251,191,36);"
                              >
                                <span class="material-icons mi-sm">star</span>
                                Required
                              </span>
                            }
                          </div>
                          <p class="text-sm text-(--color-text) opacity-80">
                            {{ event.description }}
                          </p>
                        </div>
                      </div>
                    </button>
                  }
                </div>
              </div>
            }

            @if (lingeringEvents().length > 0) {
              <div class="max-w-2xl">
                <p
                  class="font-mono text-xs uppercase tracking-widest mb-3"
                  style="color: var(--color-text-muted)"
                >
                  Open Leads From Earlier Acts
                </p>
                <div class="grid grid-cols-1 gap-4">
                  @for (event of lingeringEvents(); track event.id) {
                    <button
                      type="button"
                      (click)="selectEvent(event)"
                      class="text-left p-4 rounded-lg border cursor-pointer transition-all hover:scale-[1.01] hover:opacity-90"
                      style="background: var(--color-secondary); border-color: rgba(201,168,76,0.22);"
                    >
                      <div class="flex items-start gap-3">
                        <span class="material-icons mi-lg text-(--color-accent) opacity-60">{{
                          categoryIcon(event.category)
                        }}</span>
                        <div class="flex-1">
                          <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="font-heading text-(--color-accent) mb-0.5">
                              {{ event.title }}
                            </h3>
                            <span
                              class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded"
                              style="background: rgba(201,168,76,0.12); color: var(--color-text-muted)"
                            >
                              Act {{ event.act }}
                            </span>
                          </div>
                          <p class="text-sm text-(--color-text) opacity-80">
                            {{ event.description }}
                          </p>
                        </div>
                      </div>
                    </button>
                  }
                </div>
              </div>
            }

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
          class="w-64 shrink-0 flex flex-col gap-3 p-4 overflow-y-auto"
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
            <button
              type="button"
              class="w-full text-left cursor-pointer hover:opacity-90 transition-opacity"
              (click)="onClueClicked(clue)"
            >
              <app-clue-card [clue]="clue" [showTruth]="false" />
            </button>
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
          [imageUrl]="actBannerImageUrl()"
          (dismissed)="onActBannerDismissed()"
        />
      }

      @if (unlockSpotlight()) {
        <div
          class="fixed inset-0 z-75 flex items-center justify-center p-4"
          style="background: rgba(0,0,0,0.82)"
          (click)="dismissUnlockSpotlight()"
        >
          <div
            class="w-full max-w-xl rounded-xl overflow-hidden"
            style="background: var(--color-secondary); border: var(--border-style); box-shadow: var(--shadow-style); animation: fadeIn 0.22s ease both"
            (click)="$event.stopPropagation()"
          >
            <div
              class="px-6 py-4 flex items-center gap-3"
              style="background: linear-gradient(135deg, rgba(201,168,76,0.18), rgba(201,168,76,0.05)); border-bottom: var(--border-style)"
            >
              <span class="material-icons mi-xl text-(--color-accent)">
                {{ unlockSpotlight()!.kind === 'clue' ? 'workspace_premium' : 'person_add' }}
              </span>
              <div class="flex-1">
                <p
                  class="font-mono text-xs uppercase tracking-widest"
                  style="color: var(--color-text-muted)"
                >
                  {{
                    unlockSpotlight()!.kind === 'clue'
                      ? 'New Evidence Logged'
                      : 'New Suspect Unlocked'
                  }}
                </p>
                <h3 class="font-heading text-2xl mt-1" style="color: var(--color-accent)">
                  {{
                    unlockSpotlight()!.kind === 'clue'
                      ? currentSpotlightClue()!.name
                      : currentSpotlightSuspect()!.name
                  }}
                </h3>
              </div>
              <button
                type="button"
                (click)="dismissUnlockSpotlight()"
                class="p-1.5 rounded opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
                style="color: var(--color-text)"
              >
                <span class="material-icons">close</span>
              </button>
            </div>

            <div class="p-6 flex flex-col gap-5">
              @if (unlockSpotlight()!.kind === 'clue') {
                <div class="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5 items-start">
                  <app-clue-card
                    [clue]="currentSpotlightClue()!"
                    [showTruth]="false"
                    [variant]="'preview'"
                  />
                  <div class="flex flex-col gap-4">
                    <p class="text-sm leading-relaxed" style="color: var(--color-text)">
                      {{ currentSpotlightClue()!.description }}
                    </p>
                    <div
                      class="rounded-lg p-4"
                      style="background: var(--color-surface); border: var(--border-style)"
                    >
                      <p
                        class="font-mono text-xs uppercase tracking-widest mb-2"
                        style="color: var(--color-accent)"
                      >
                        Why It Matters
                      </p>
                      <p class="text-sm leading-relaxed italic" style="color: var(--color-text)">
                        {{ currentSpotlightClue()!.revealsInfo }}
                      </p>
                    </div>
                  </div>
                </div>
              } @else {
                <div class="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5 items-start">
                  <app-suspect-card
                    [suspect]="currentSpotlightSuspect()!"
                    [isInterviewed]="isInterviewed(currentSpotlightSuspect()!.id)"
                    [variant]="'preview'"
                    (cardClicked)="onSuspectClicked($event)"
                  />
                  <div class="flex flex-col gap-4">
                    <p class="font-mono text-sm" style="color: var(--color-text-muted)">
                      {{ currentSpotlightSuspect()!.occupation }} ·
                      {{ currentSpotlightSuspect()!.relationship }}
                    </p>
                    <p class="text-sm leading-relaxed" style="color: var(--color-text)">
                      {{ currentSpotlightSuspect()!.description }}
                    </p>
                    <div
                      class="rounded-lg p-4"
                      style="background: var(--color-surface); border: var(--border-style)"
                    >
                      <p
                        class="font-mono text-xs uppercase tracking-widest mb-2"
                        style="color: var(--color-accent)"
                      >
                        First Read
                      </p>
                      <p class="text-sm leading-relaxed" style="color: var(--color-text)">
                        {{ currentSpotlightSuspect()!.personality }}
                      </p>
                    </div>
                  </div>
                </div>
              }

              <div class="flex justify-end">
                <button
                  type="button"
                  (click)="dismissUnlockSpotlight()"
                  class="px-5 py-2 rounded border font-mono text-xs uppercase tracking-widest cursor-pointer hover:opacity-85 transition-opacity"
                  style="border-color: var(--color-accent); color: var(--color-accent)"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- ===== Case File Modal ===== -->
      @if (caseFileOpen()) {
        <div class="fixed inset-0 z-60 bg-black/60" (click)="caseFileOpen.set(false)"></div>

        <div
          class="fixed inset-3 md:inset-6 z-70 flex flex-col rounded-xl overflow-hidden"
          style="background: var(--color-secondary); border: var(--border-style); box-shadow: var(--shadow-style); animation: fadeIn 0.22s ease both"
          (click)="$event.stopPropagation()"
        >
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

          <div class="flex shrink-0 px-5 gap-1 pt-3" style="border-bottom: var(--border-style)">
            @for (tab of caseFileTabs(); track tab.id) {
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

          <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
            <!-- BRIEFING TAB -->
            @if (caseFileTab() === 'briefing') {
              <div class="flex flex-col gap-4">
                <!-- ── Case header: title + small inline thumbnail ── -->
                <section
                  class="rounded-lg p-4 flex gap-4 items-start"
                  style="background: var(--color-surface); border: var(--border-style)"
                >
                  <div class="flex flex-col gap-2 flex-1 min-w-0">
                    <span
                      class="font-mono text-[0.68rem] uppercase tracking-[0.26em]"
                      style="color: var(--color-text-muted)"
                      >{{ casePackage()?.metadata?.caseType }}</span
                    >
                    <h3
                      class="font-heading text-xl leading-tight"
                      style="color: var(--color-accent)"
                    >
                      {{ casePackage()?.metadata?.title }}
                    </h3>
                    @if (casePackage()?.metadata?.subtitle) {
                      <p class="font-mono text-xs" style="color: var(--color-text-muted)">
                        {{ casePackage()?.metadata?.subtitle }}
                      </p>
                    }
                    <div class="flex flex-wrap gap-1.5 mt-1">
                      <span
                        class="rounded px-2 py-0.5 font-mono text-[0.65rem]"
                        style="background: rgba(201,168,76,0.14); color: var(--color-accent)"
                        >Act {{ gameState()?.currentAct ?? 1 }} / 3</span
                      >
                      <span
                        class="rounded px-2 py-0.5 font-mono text-[0.65rem]"
                        style="background: rgba(255,255,255,0.05); color: var(--color-text-muted)"
                        >{{ casePackage()?.metadata?.setting }}</span
                      >
                      <span
                        class="rounded px-2 py-0.5 font-mono text-[0.65rem]"
                        style="background: rgba(255,255,255,0.05); color: var(--color-text-muted)"
                        >{{ foundClues().length }} evidence</span
                      >
                      <span
                        class="rounded px-2 py-0.5 font-mono text-[0.65rem]"
                        style="background: rgba(255,255,255,0.05); color: var(--color-text-muted)"
                        >{{ unlockedSuspects().length }} suspects ·
                        {{ revealedLocationCount() }} locations</span
                      >
                      <span
                        class="rounded px-2 py-0.5 font-mono text-[0.65rem]"
                        style="background: rgba(255,255,255,0.05); color: var(--color-text-muted)"
                        >{{ hintsRemaining() }} hints left</span
                      >
                    </div>
                  </div>
                  @if (casePackage()?.briefingImageUrl) {
                    <button
                      type="button"
                      (click)="
                        openCaseFileImage(
                          casePackage()!.briefingImageUrl!,
                          casePackage()?.metadata?.title ?? 'Case image',
                          casePackage()?.metadata?.setting ?? ''
                        )
                      "
                      class="group shrink-0 rounded-md overflow-hidden cursor-pointer"
                      style="width: 136px; height: 92px; background: rgba(255,255,255,0.04)"
                      aria-label="Expand case image"
                    >
                      <img
                        [src]="casePackage()!.briefingImageUrl"
                        [alt]="casePackage()?.metadata?.title"
                        class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
                      />
                    </button>
                  }
                </section>

                <!-- ── Briefing text ── -->
                <section
                  class="rounded-lg p-4 flex flex-col gap-2"
                  style="background: var(--color-surface); border: var(--border-style)"
                >
                  <p
                    class="font-mono text-xs uppercase tracking-widest flex items-center gap-1.5"
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
                </section>

                <!-- ── Act previews: horizontal thumbnail + text ── -->
                <div class="flex flex-col gap-3">
                  @for (act of briefingActPreviews(); track act.label) {
                    <article
                      class="rounded-lg overflow-hidden flex"
                      style="background: var(--color-surface); border: var(--border-style)"
                    >
                      @if (act.imageUrl) {
                        <button
                          type="button"
                          (click)="
                            openCaseFileImage(
                              act.imageUrl,
                              act.label + ' – ' + (casePackage()?.metadata?.title ?? ''),
                              act.summary
                            )
                          "
                          class="group shrink-0 overflow-hidden cursor-pointer"
                          style="width: 128px; min-height: 84px; background: rgba(255,255,255,0.04)"
                          [attr.aria-label]="'Expand image for ' + act.label"
                        >
                          <img
                            [src]="act.imageUrl"
                            [alt]="act.label"
                            class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
                          />
                        </button>
                      } @else {
                        <div
                          class="shrink-0 flex items-center justify-center opacity-20"
                          style="width: 128px; min-height: 84px; background: rgba(255,255,255,0.04)"
                        >
                          <span
                            class="material-icons"
                            style="font-size: 2rem; color: var(--color-text)"
                            >image_not_supported</span
                          >
                        </div>
                      }
                      <div class="flex-1 flex flex-col gap-1 p-3 min-w-0">
                        <p
                          class="font-mono text-xs uppercase tracking-widest"
                          style="color: var(--color-accent)"
                        >
                          {{ act.label }}
                        </p>
                        <p
                          class="text-sm leading-relaxed"
                          style="font-family: var(--font-body); color: var(--color-text); opacity: 0.88"
                        >
                          {{ act.summary }}
                        </p>
                      </div>
                    </article>
                  }
                </div>
              </div>
            }

            <!-- TIMELINE TAB -->
            @if (isTimelineUnlocked() && caseFileTab() === 'timeline') {
              <div
                class="rounded-lg p-4 mb-4"
                style="background: var(--color-surface); border: var(--border-style)"
              >
                <p
                  class="font-mono text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5"
                  style="color: var(--color-accent)"
                >
                  <span class="material-icons" style="font-size: 0.9rem">info</span>
                  Working Timeline
                </p>
                <p
                  class="text-sm leading-relaxed"
                  style="font-family: var(--font-body); color: var(--color-text)"
                >
                  {{ timelineTabIntro() }}
                </p>
              </div>
              @if (visibleTimelineEvents().length === 0) {
                <div class="flex flex-col items-center gap-3 py-12 opacity-50">
                  <span class="material-icons text-5xl" style="color: var(--color-text-muted)"
                    >schedule</span
                  >
                  <p class="font-mono text-sm" style="color: var(--color-text-muted)">
                    Timeline entries unlock as you complete investigations.
                  </p>
                </div>
              }
              <div class="flex flex-col gap-0">
                @for (event of visibleTimelineEvents(); track event.id; let last = $last) {
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

            <!-- ARCHIVE TAB -->
            @if (caseFileTab() === 'archive') {
              <div class="flex flex-col gap-5">
                <div
                  class="rounded-lg p-4"
                  style="background: var(--color-surface); border: var(--border-style)"
                >
                  <p
                    class="font-mono text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5"
                    style="color: var(--color-accent)"
                  >
                    <span class="material-icons" style="font-size: 0.9rem">history</span>
                    Investigation Archive
                  </p>
                  <p
                    class="text-sm leading-relaxed"
                    style="font-family: var(--font-body); color: var(--color-text)"
                  >
                    Revisit completed scenes, interviews, puzzles, and deductions without changing
                    progression.
                  </p>
                </div>

                <div class="flex flex-col gap-3">
                  <h3
                    class="font-mono text-xs uppercase tracking-widest"
                    style="color: var(--color-text-muted)"
                  >
                    Completed Events
                  </h3>
                  @if (completedFieldEvents().length === 0) {
                    <p class="text-sm italic" style="color: var(--color-text-muted)">
                      No completed field events yet.
                    </p>
                  }
                  @for (event of completedFieldEvents(); track event.id) {
                    <button
                      type="button"
                      (click)="revisitEvent(event)"
                      class="text-left p-4 rounded-lg border cursor-pointer transition-opacity hover:opacity-90"
                      style="background: var(--color-surface); border-color: rgba(201,168,76,0.2);"
                    >
                      <div class="flex items-start gap-3">
                        <span class="material-icons mi-lg text-(--color-accent) opacity-70">{{
                          categoryIcon(event.category)
                        }}</span>
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <h4 class="font-heading text-(--color-accent)">{{ event.title }}</h4>
                            <span
                              class="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded"
                              style="background: rgba(201,168,76,0.12); color: var(--color-text-muted)"
                            >
                              Act {{ event.act }}
                            </span>
                          </div>
                          <p class="text-sm mt-1" style="color: var(--color-text); opacity: 0.8">
                            {{ event.description }}
                          </p>
                        </div>
                        <span
                          class="material-icons mi-sm shrink-0"
                          style="color: var(--color-accent)"
                        >
                          replay
                        </span>
                      </div>
                    </button>
                  }
                </div>

                <div class="flex flex-col gap-3">
                  <h3
                    class="font-mono text-xs uppercase tracking-widest"
                    style="color: var(--color-text-muted)"
                  >
                    Interview Records
                  </h3>
                  @if (completedInterviews().length === 0) {
                    <p class="text-sm italic" style="color: var(--color-text-muted)">
                      No completed interviews yet.
                    </p>
                  }
                  @for (event of completedInterviews(); track event.id) {
                    <button
                      type="button"
                      (click)="revisitEvent(event)"
                      class="text-left p-4 rounded-lg border cursor-pointer transition-opacity hover:opacity-90"
                      style="background: var(--color-surface); border-color: rgba(201,168,76,0.2);"
                    >
                      <div class="flex items-start gap-3">
                        <span class="material-icons mi-lg text-(--color-accent) opacity-70"
                          >record_voice_over</span
                        >
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <h4 class="font-heading text-(--color-accent)">{{ event.title }}</h4>
                            <span
                              class="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded"
                              style="background: rgba(201,168,76,0.12); color: var(--color-text-muted)"
                            >
                              {{ suspectName(event.dialogueSuspectId) }}
                            </span>
                          </div>
                          <p class="text-sm mt-1" style="color: var(--color-text); opacity: 0.8">
                            {{ event.description }}
                          </p>
                        </div>
                        <span
                          class="material-icons mi-sm shrink-0"
                          style="color: var(--color-accent)"
                        >
                          replay
                        </span>
                      </div>
                    </button>
                  }
                </div>

                <div class="flex flex-col gap-3">
                  <h3
                    class="font-mono text-xs uppercase tracking-widest"
                    style="color: var(--color-text-muted)"
                  >
                    Evidence Log
                  </h3>
                  @if (archiveClues().length === 0) {
                    <p class="text-sm italic" style="color: var(--color-text-muted)">
                      No clues logged yet.
                    </p>
                  }
                  <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                    @for (clue of archiveClues(); track clue.id) {
                      <button
                        type="button"
                        class="text-left cursor-pointer hover:opacity-90 transition-opacity"
                        (click)="onClueClicked(clue)"
                      >
                        <app-clue-card [clue]="clue" [showTruth]="false" />
                      </button>
                    }
                  </div>
                </div>

                <div class="flex flex-col gap-3">
                  <h3
                    class="font-mono text-xs uppercase tracking-widest"
                    style="color: var(--color-text-muted)"
                  >
                    Suspect Dossier
                  </h3>
                  @if (archiveSuspects().length === 0) {
                    <p class="text-sm italic" style="color: var(--color-text-muted)">
                      No suspects logged yet.
                    </p>
                  }
                  <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                    @for (suspect of archiveSuspects(); track suspect.id) {
                      <app-suspect-card
                        [suspect]="suspect"
                        [isInterviewed]="isInterviewed(suspect.id)"
                        [variant]="'expanded'"
                        (cardClicked)="onSuspectClicked($event)"
                      />
                    }
                  </div>
                </div>
              </div>
            }

            <!-- LOCATIONS TAB -->
            @if (caseFileTab() === 'locations') {
              <div class="flex flex-col gap-6">
                <div
                  class="rounded-lg p-4"
                  style="background: var(--color-surface); border: var(--border-style)"
                >
                  <p
                    class="font-mono text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5"
                    style="color: var(--color-accent)"
                  >
                    <span class="material-icons" style="font-size: 0.9rem">map</span>
                    Crime Scene Map
                  </p>
                  <p
                    class="text-sm leading-relaxed"
                    style="font-family: var(--font-body); color: var(--color-text)"
                  >
                    Locations appear here as your leads uncover them. Clue counts update as you
                    discover evidence.
                  </p>
                </div>

                @if (locationsByAct().length === 0) {
                  <p class="text-sm italic" style="color: var(--color-text-muted)">
                    No locations uncovered yet.
                  </p>
                }

                @for (group of locationsByAct(); track group.act) {
                  <div class="flex flex-col gap-3">
                    <h3
                      class="font-mono text-xs uppercase tracking-widest flex items-center gap-2"
                      style="color: var(--color-accent)"
                    >
                      <span class="material-icons" style="font-size: 0.9rem">bookmark</span>
                      Act {{ group.act }}
                    </h3>
                    <div
                      class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3"
                    >
                      @for (entry of group.locations; track entry.location.id) {
                        <app-location-card
                          [location]="entry.location"
                          [isVisited]="entry.cluesFound > 0"
                          (cardClicked)="onLocationClicked($event)"
                        />
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- ===== Suspect Detail Modal ===== -->
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
            <!-- Close -->
            <button
              type="button"
              (click)="expandedSuspect.set(null)"
              class="absolute top-3 right-3 z-10 p-1.5 rounded-full opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
              style="background: var(--color-surface)"
            >
              <span class="material-icons mi-md" style="color: var(--color-text)">close</span>
            </button>
            <!-- Portrait -->
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
                  <span class="material-icons" style="font-size: 5rem; color: var(--color-text)"
                    >person</span
                  >
                </div>
              }
            </div>
            <!-- Content -->
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
                  >Personality</span
                >
                <p
                  class="text-sm leading-relaxed"
                  style="font-family: var(--font-body); color: var(--color-text)"
                >
                  {{ expandedSuspect()!.personality }}
                </p>
              </div>
              @if (isInterviewed(expandedSuspect()!.id)) {
                <div
                  class="rounded p-4 flex flex-col gap-2"
                  style="background: var(--color-surface); border: var(--border-style)"
                >
                  <span
                    class="font-mono text-xs uppercase tracking-widest"
                    style="color: var(--color-accent)"
                    >Stated Alibi</span
                  >
                  <p
                    class="text-sm leading-relaxed"
                    style="font-family: var(--font-body); color: var(--color-text)"
                  >
                    {{ expandedSuspect()!.alibi }}
                  </p>
                </div>
              }
              <div class="flex gap-3 pt-2">
                <button
                  type="button"
                  (click)="interviewFromModal(expandedSuspect()!)"
                  class="flex-1 py-2.5 px-4 rounded font-mono text-xs uppercase tracking-widest cursor-pointer transition-opacity hover:opacity-80 flex items-center justify-center gap-2"
                  style="background: var(--color-accent); color: var(--color-primary)"
                >
                  <span class="material-icons mi-sm">record_voice_over</span>
                  Interview
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- ===== Clue Detail Modal ===== -->
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
            <!-- Close -->
            <button
              type="button"
              (click)="expandedClue.set(null)"
              class="absolute top-3 right-3 z-10 p-1.5 rounded-full opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
              style="background: var(--color-surface)"
            >
              <span class="material-icons mi-md" style="color: var(--color-text)">close</span>
            </button>
            <!-- Evidence image -->
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
                  <span class="material-icons" style="font-size: 5rem; color: var(--color-text)"
                    >search</span
                  >
                </div>
              }
            </div>
            <!-- Content -->
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

      <!-- ===== Location Detail Modal ===== -->
      @if (expandedLocation()) {
        <div
          class="fixed inset-0 z-80 flex items-center justify-center p-4"
          style="background: rgba(0,0,0,0.85)"
          (click)="expandedLocation.set(null)"
        >
          <div
            class="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg flex flex-col"
            style="background: var(--color-secondary); border: var(--border-style); animation: fadeIn 0.2s ease both"
            (click)="$event.stopPropagation()"
          >
            <button
              type="button"
              (click)="expandedLocation.set(null)"
              class="absolute top-3 right-3 z-10 p-1.5 rounded-full opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
              style="background: var(--color-surface)"
            >
              <span class="material-icons mi-md" style="color: var(--color-text)">close</span>
            </button>
            <div
              class="w-full overflow-hidden rounded-t-lg"
              style="aspect-ratio: 16/9; background: var(--color-surface)"
            >
              @if (expandedLocation()!.imageUrl) {
                <img
                  [src]="expandedLocation()!.imageUrl"
                  [alt]="expandedLocation()!.name"
                  class="w-full h-full object-cover"
                />
              } @else {
                <div class="w-full h-full flex items-center justify-center opacity-20">
                  <span class="material-icons" style="font-size: 5rem; color: var(--color-text)"
                    >location_city</span
                  >
                </div>
              }
            </div>
            <div class="p-6 flex flex-col gap-4">
              <div class="flex items-center gap-2">
                <span class="material-icons mi-md" style="color: var(--color-accent)"
                  >location_on</span
                >
                <h2 class="font-heading text-2xl" style="color: var(--color-accent)">
                  {{ expandedLocation()!.name }}
                </h2>
              </div>
              <p
                class="text-base leading-relaxed"
                style="font-family: var(--font-body); color: var(--color-text)"
              >
                {{ expandedLocation()!.description }}
              </p>
              <div
                class="rounded p-4 flex flex-col gap-2"
                style="background: var(--color-surface); border: var(--border-style)"
              >
                <span
                  class="font-mono text-xs uppercase tracking-widest flex items-center gap-1.5"
                  style="color: var(--color-accent)"
                >
                  <span class="material-icons" style="font-size: 0.9rem">wb_twilight</span>
                  Atmosphere
                </span>
                <p
                  class="text-sm leading-relaxed italic"
                  style="font-family: var(--font-body); color: var(--color-text)"
                >
                  {{ expandedLocation()!.atmosphere }}
                </p>
              </div>
              <div>
                <p
                  class="font-mono text-xs uppercase tracking-widest mb-2"
                  style="color: var(--color-text-muted)"
                >
                  Clues Found Here
                </p>
                @if (expandedLocation()!.cluesFoundHere.length === 0) {
                  <p class="text-sm italic" style="color: var(--color-text-muted)">
                    No logged clues at this location yet.
                  </p>
                } @else {
                  <div class="flex flex-wrap gap-2">
                    @for (clueId of expandedLocation()!.cluesFoundHere; track clueId) {
                      <span
                        class="px-2 py-1 rounded font-mono text-xs"
                        style="background: rgba(201,168,76,0.12); color: var(--color-text)"
                      >
                        {{ clueName(clueId) }}
                      </span>
                    }
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      }

      @if (expandedCaseFileImage()) {
        <div
          class="fixed inset-0 z-80 flex items-center justify-center p-4"
          style="background: rgba(0,0,0,0.88)"
          (click)="expandedCaseFileImage.set(null)"
        >
          <div
            class="relative w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-lg flex flex-col"
            style="background: var(--color-secondary); border: var(--border-style); animation: fadeIn 0.2s ease both"
            (click)="$event.stopPropagation()"
          >
            <button
              type="button"
              (click)="expandedCaseFileImage.set(null)"
              class="absolute top-3 right-3 z-10 p-1.5 rounded-full opacity-70 hover:opacity-100 cursor-pointer transition-opacity"
              style="background: rgba(0,0,0,0.45)"
              aria-label="Close expanded image"
            >
              <span class="material-icons mi-md" style="color: white">close</span>
            </button>
            <div
              class="w-full flex items-center justify-center bg-black/35 max-h-[72vh] overflow-hidden"
            >
              <img
                [src]="expandedCaseFileImage()!.url"
                [alt]="expandedCaseFileImage()!.alt"
                class="w-full h-full object-contain max-h-[72vh]"
              />
            </div>
            <div class="p-4 md:p-5 flex flex-col gap-2" style="background: var(--color-secondary)">
              <h3 class="font-heading text-2xl" style="color: var(--color-accent)">
                {{ expandedCaseFileImage()!.title }}
              </h3>
              @if (expandedCaseFileImage()!.caption) {
                <p
                  class="text-sm leading-relaxed"
                  style="font-family: var(--font-body); color: var(--color-text)"
                >
                  {{ expandedCaseFileImage()!.caption }}
                </p>
              }
            </div>
          </div>
        </div>
      }

      @if (debugDashboardOpen() && casePackage(); as pkg) {
        <app-debug-dashboard [casePackage]="pkg" (closeRequested)="debugDashboardOpen.set(false)" />
      }

      @if (styleConfigOpen()) {
        <app-style-config
          [originalTheme]="casePackage()?.uiTheme ?? null"
          (closed)="styleConfigOpen.set(false)"
        />
      }

      <!-- ===== LLM Interview Chat ===== -->

      <style>
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.97);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      </style>
    </div>
  `,
})
export class InvestigationView implements OnInit {
  private readonly router = inject(Router);
  private readonly caseStore = inject(CaseStoreService);
  private readonly debugTrace = inject(DebugTraceService);
  private readonly gsvc = inject(GameStateService);
  private readonly theme = inject(ThemeService);
  private readonly toast = inject(ToastService);
  private readonly imageService = inject(ImageService);
  private readonly interviewService = inject(InterviewService);

  readonly isLoading = signal(true);
  readonly casePackage = signal<CasePackage | null>(null);
  readonly selectedEvent = signal<InvestigationEvent | null>(null);
  readonly activeDialogueLines = signal<DialogueLine[]>([]);
  readonly activeInterviewSuspect = signal<Suspect | null>(null);
  readonly revisitInterviewTranscript = signal<InterviewChatMessage[] | null>(null);
  readonly showActBanner = signal(false);
  readonly actBannerTitle = signal('');
  readonly actBannerSummary = signal('');
  readonly currentActForBanner = signal<1 | 2 | 3>(1);
  readonly actBannerImageUrl = computed(() => {
    if (!this.showActBanner()) return '';
    const act = this.currentActForBanner();
    const pkg = this.casePackage();
    if (!pkg) return '';
    return act === 1
      ? (pkg.act1ImageUrl ?? '')
      : act === 2
        ? (pkg.act2ImageUrl ?? '')
        : act === 3
          ? (pkg.act3ImageUrl ?? '')
          : '';
  });
  readonly recentClueIds = signal<string[]>([]);
  readonly examinedSpotIds = signal<string[]>([]);
  readonly activeSpot = signal<ExaminationSpot | null>(null);

  readonly activeExaminationSpots = computed((): ExaminationSpot[] => {
    return this.selectedEvent()?.examinationSpots ?? [];
  });

  readonly canLeaveScene = computed((): boolean => {
    const spots = this.activeExaminationSpots();
    if (spots.length === 0) return true;
    const clueSpots = spots.filter((s) => !!s.rewardsClueId);
    if (clueSpots.length === 0) return true;
    const examined = this.examinedSpotIds();
    return clueSpots.every((s) => examined.includes(s.id));
  });
  readonly sidebarOpen = signal(true);
  readonly activeHint = signal<Hint | null>(null);
  readonly caseFileOpen = signal(false);
  readonly caseFileTab = signal<'briefing' | 'timeline' | 'archive' | 'locations'>('briefing');
  readonly expandedSuspect = signal<Suspect | null>(null);
  readonly expandedClue = signal<Clue | null>(null);
  readonly expandedLocation = signal<GameLocation | null>(null);
  readonly expandedCaseFileImage = signal<CaseFileImageLightbox | null>(null);
  readonly replayingEventId = signal<string | null>(null);
  readonly unlockSpotlight = signal<UnlockSpotlight | null>(null);
  readonly debugDashboardOpen = signal(false);
  readonly styleConfigOpen = signal(false);

  readonly gameState = this.gsvc.state;
  readonly isAccusationUnlocked = this.gsvc.isAccusationUnlocked;

  private readonly unlockSpotlightQueue: UnlockSpotlight[] = [];

  readonly availableEvents = computed((): InvestigationEvent[] => {
    const pkg = this.casePackage();
    const state = this.gameState();
    if (!pkg || !state) return [];
    return this.gsvc
      .getAvailableEvents(pkg, state)
      .slice()
      .sort((a, b) => {
        const actDelta = b.act - a.act;
        if (actDelta !== 0) return actDelta;
        if (a.isMandatory !== b.isMandatory) return a.isMandatory ? -1 : 1;
        return a.title.localeCompare(b.title);
      });
  });

  readonly currentActEvents = computed(() => {
    const currentAct = this.gameState()?.currentAct ?? 1;
    return this.availableEvents().filter((event) => event.act === currentAct);
  });

  readonly lingeringEvents = computed(() => {
    const currentAct = this.gameState()?.currentAct ?? 1;
    return this.availableEvents().filter((event) => event.act < currentAct);
  });

  readonly unlockedSuspects = computed((): Suspect[] => {
    const pkg = this.casePackage();
    const state = this.gameState();
    if (!pkg || !state) return [];

    const visibleSuspectIds = new Set<string>(state.unlockedSuspectIds);

    state.interviewedSuspectIds.forEach((id) => visibleSuspectIds.add(id));

    return pkg.suspects.filter((suspect) => visibleSuspectIds.has(suspect.id));
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

  readonly completedEvents = computed((): InvestigationEvent[] => {
    const pkg = this.casePackage();
    const state = this.gameState();
    if (!pkg || !state) return [];
    return pkg.eventGraph.filter((event) => state.completedEventIds.includes(event.id));
  });

  readonly completedInterviews = computed((): InvestigationEvent[] => {
    return this.completedEvents().filter((event) => !!event.dialogueSuspectId);
  });

  readonly completedFieldEvents = computed((): InvestigationEvent[] => {
    return this.completedEvents().filter((event) => !event.dialogueSuspectId);
  });

  readonly archiveClues = computed((): Clue[] => {
    const pkg = this.casePackage();
    const state = this.gameState();
    if (!pkg || !state) return [];
    return pkg.clues.filter((clue) => state.foundClueIds.includes(clue.id));
  });

  readonly archiveSuspects = computed((): Suspect[] => {
    return this.unlockedSuspects();
  });

  readonly currentSpotlightClue = computed((): Clue | null => {
    const spotlight = this.unlockSpotlight();
    return spotlight?.kind === 'clue' ? spotlight.clue : null;
  });

  readonly currentSpotlightSuspect = computed((): Suspect | null => {
    const spotlight = this.unlockSpotlight();
    return spotlight?.kind === 'suspect' ? spotlight.suspect : null;
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

  readonly isTimelineUnlocked = computed(
    () => (this.gameState()?.completedEventIds.length ?? 0) > 0,
  );

  readonly caseFileTabs = computed(() => {
    const tabs: Array<{
      id: 'briefing' | 'timeline' | 'archive' | 'locations';
      label: string;
      icon: string;
    }> = [
      { id: 'briefing' as const, label: 'Briefing', icon: 'description' },
      { id: 'locations' as const, label: 'Locations', icon: 'map' },
      { id: 'archive' as const, label: 'Archive', icon: 'inventory' },
    ];

    if (this.isTimelineUnlocked()) {
      tabs.splice(1, 0, { id: 'timeline' as const, label: 'Case Timeline', icon: 'schedule' });
    }

    return tabs;
  });

  readonly locationsByAct = computed(() => {
    const pkg = this.casePackage();
    const state = this.gameState();
    if (!pkg || !state) return [];

    const foundClueIds = new Set(state.foundClueIds);
    const completedEventIds = new Set(state.completedEventIds);
    const visitedLocationIds = new Set(state.visitedLocationIds);

    const actGroups = new Map<
      number,
      Array<{ location: GameLocation; cluesFound: number; cluesTotal: number }>
    >();
    for (const location of pkg.locations) {
      const cluesHere = pkg.clues.filter((c) => c.locationId === location.id);
      const clueIdSet = new Set(cluesHere.map((c) => c.id));
      const events = pkg.eventGraph.filter((e) => e.rewardsClueIds.some((id) => clueIdSet.has(id)));
      const isRevealed =
        visitedLocationIds.has(location.id) ||
        cluesHere.some((clue) => foundClueIds.has(clue.id)) ||
        events.some((event) => completedEventIds.has(event.id));

      if (!isRevealed) continue;

      // Assign to the act of the earliest relevant event; default to act 1.
      const act: number = events.length > 0 ? Math.min(...events.map((e) => e.act)) : 1;
      const cluesFound = cluesHere.filter((c) => foundClueIds.has(c.id)).length;
      if (!actGroups.has(act)) actGroups.set(act, []);
      actGroups.get(act)!.push({ location, cluesFound, cluesTotal: cluesHere.length });
    }

    return ([1, 2, 3] as const)
      .filter((act) => actGroups.has(act))
      .map((act) => ({ act, locations: actGroups.get(act)! }));
  });

  readonly briefingActPreviews = computed(() => {
    const m = this.casePackage()?.metadata;
    const pkg = this.casePackage();
    const currentAct = this.gameState()?.currentAct ?? 1;
    if (!m || !pkg) return [];
    return [
      { label: 'Act I', summary: m.act1Summary, imageUrl: pkg.act1ImageUrl },
      { label: 'Act II', summary: m.act2Summary, imageUrl: pkg.act2ImageUrl },
      { label: 'Act III', summary: m.act3Summary, imageUrl: pkg.act3ImageUrl },
    ].slice(0, currentAct);
  });

  readonly revealedLocationCount = computed(() =>
    this.locationsByAct().reduce((count, group) => count + group.locations.length, 0),
  );

  readonly visibleTimelineEvents = computed(() => {
    const pkg = this.casePackage();
    const completedCount = this.gameState()?.completedEventIds.length ?? 0;
    if (!pkg || completedCount === 0) return [];
    return pkg.timeline.slice(0, Math.min(pkg.timeline.length, completedCount));
  });

  readonly timelineTabIntro = computed(() => {
    const visible = this.visibleTimelineEvents().length;
    const total = this.casePackage()?.timeline.length ?? 0;
    return (
      'This is your working case chronology: witness accounts, reported movements, and known events around the crime. ' +
      'More entries unlock as you complete investigations. ' +
      `${visible} of ${total} entries discovered so far.`
    );
  });

  clueLocationName(locationId: string): string {
    return this.casePackage()?.locations.find((l) => l.id === locationId)?.name ?? locationId;
  }

  clueName(clueId: string): string {
    return this.casePackage()?.clues.find((clue) => clue.id === clueId)?.name ?? clueId;
  }

  suspectName(suspectId: string | undefined): string {
    if (!suspectId) return 'Unknown suspect';
    return (
      this.casePackage()?.suspects.find((suspect) => suspect.id === suspectId)?.name ?? suspectId
    );
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
      this.caseStore
        .loadDebugTrace(sessionId)
        .subscribe((trace) => this.debugTrace.loadSnapshot(trace));

      // Retroactively repair any deadlocked event graph from older saves.
      const repairedPkg: CasePackage = {
        ...pkg,
        eventGraph: repairEventGraph(pkg.eventGraph),
      };

      this.casePackage.set(repairedPkg);
      this.theme.applyTheme(repairedPkg.uiTheme);
      this.theme.applyTexture(repairedPkg.uiTheme.textureFamily);
      this.isLoading.set(false);

      // Show Act I banner on fresh start (no events completed yet)
      const state = this.gsvc.state();
      if (state && state.currentAct === 1 && state.completedEventIds.length === 0) {
        this.currentActForBanner.set(1);
        this.actBannerTitle.set('Act I: The Investigation Begins');
        this.actBannerSummary.set(repairedPkg.metadata.act1Summary);
        this.showActBanner.set(true);
      }

      // Re-hydrate blob object URLs from the IndexedDB image cache (they don't survive page refresh)
      this.imageService.generateAllCaseImages(repairedPkg).subscribe({
        next: (updated) => this.casePackage.set(updated),
      });
    });
  }

  selectEvent(event: InvestigationEvent): void {
    this.replayingEventId.set(null);
    this.selectedEvent.set(event);
    this.recentClueIds.set([]);
    this.examinedSpotIds.set([]);
    this.activeSpot.set(null);

    if (event.dialogueSuspectId) {
      const suspect = this.casePackage()?.suspects.find((s) => s.id === event.dialogueSuspectId);
      if (suspect) {
        this.gsvc.interviewSuspect(event.dialogueSuspectId);
        this.revisitInterviewTranscript.set(null);
        this.activeInterviewSuspect.set(suspect);
      }
    } else if (event.category !== 'puzzle') {
      this.activeDialogueLines.set([]);
    }
  }

  revisitEvent(event: InvestigationEvent): void {
    this.caseFileOpen.set(false);
    this.replayingEventId.set(event.id);
    this.selectedEvent.set(event);
    this.recentClueIds.set([]);

    if (event.dialogueSuspectId) {
      const suspect = this.casePackage()?.suspects.find((s) => s.id === event.dialogueSuspectId);
      if (suspect) {
        const sessionId = this.gameState()?.sessionId ?? '';
        const stored = this.interviewService.getStoredTranscript(sessionId, suspect.id);
        this.revisitInterviewTranscript.set(stored);
        this.activeInterviewSuspect.set(suspect);
      } else {
        this.activeDialogueLines.set([]);
      }
      return;
    }

    this.activeDialogueLines.set([]);
  }

  onDialogueClosed(): void {
    const event = this.selectedEvent();
    if (event && !this.isReplayingEvent(event.id)) this.completeCurrentEvent(event);
    this.activeDialogueLines.set([]);
    this.replayingEventId.set(null);
    this.selectedEvent.set(null);
  }

  onInterviewClosed(): void {
    const event = this.selectedEvent();
    if (event && !this.isReplayingEvent(event.id) && this.interviewService.allRequiredRevealed()) {
      this.completeCurrentEvent(event);
    }
    this.activeInterviewSuspect.set(null);
    this.revisitInterviewTranscript.set(null);
    this.replayingEventId.set(null);
    this.selectedEvent.set(null);
  }

  onPuzzleSolved(clueId: string): void {
    const event = this.selectedEvent();
    const puzzle = this.activePuzzle();
    const pkg = this.casePackage();
    if (event) {
      if (!this.isReplayingEvent(event.id)) {
        if (puzzle) this.gsvc.completePuzzle(puzzle.id);
        const effectiveRewardClueIds = pkg ? this.rewardClueIdsForEvent(event, pkg) : [];
        if (clueId && !effectiveRewardClueIds.includes(clueId)) this.gsvc.discoverClue(clueId);
        this.completeCurrentEvent(event);
      }
    }
    this.replayingEventId.set(null);
    this.selectedEvent.set(null);
  }

  finishNarration(): void {
    const event = this.selectedEvent();
    if (event && !this.isReplayingEvent(event.id)) this.completeCurrentEvent(event);
    this.recentClueIds.set([]);
    this.replayingEventId.set(null);
    this.selectedEvent.set(null);
    this.examinedSpotIds.set([]);
    this.activeSpot.set(null);
  }

  examineSpot(spot: ExaminationSpot): void {
    this.activeSpot.set(spot);
    if (!this.examinedSpotIds().includes(spot.id)) {
      this.examinedSpotIds.update((ids) => [...ids, spot.id]);

      if (spot.rewardsClueId) {
        const pkg = this.casePackage();
        const state = this.gsvc.state();
        const clue = pkg?.clues.find((c) => c.id === spot.rewardsClueId);
        if (clue && state && !state.foundClueIds.includes(clue.id)) {
          this.gsvc.discoverClue(clue.id);
          this.gsvc.visitLocation(clue.locationId);
          this.enqueueUnlockSpotlights([clue], []);
        }
      }
    }
  }

  getClueById(id: string): Clue | undefined {
    return this.casePackage()?.clues.find((c) => c.id === id);
  }

  onSuspectClicked(suspect: Suspect): void {
    this.expandedSuspect.set(suspect);
  }

  interviewFromModal(suspect: Suspect): void {
    this.expandedSuspect.set(null);
    const available = this.availableEvents().find(
      (e) => e.dialogueSuspectId === suspect.id && e.category === 'social',
    );
    if (available) {
      this.selectEvent(available);
      return;
    }

    const completedInterview = this.completedInterviews().find(
      (event) => event.dialogueSuspectId === suspect.id,
    );
    if (completedInterview) {
      this.revisitEvent(completedInterview);
    } else {
      this.toast.show(`Nothing new to ask ${suspect.name} right now.`, 'info');
    }
  }

  onClueClicked(clue: Clue): void {
    this.expandedClue.set(clue);
  }

  onLocationClicked(location: GameLocation): void {
    this.expandedLocation.set(location);
  }

  openCaseFileImage(url: string, title: string, caption: string): void {
    if (!url) return;
    this.expandedCaseFileImage.set({
      url,
      alt: title,
      title,
      caption,
    });
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

  goHome(): void {
    void this.router.navigate(['/']);
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
    const pkg = this.casePackage();
    const state = this.gsvc.state();
    if (!pkg || !state) return;

    // For investigation events with examination spots, clues are discovered
    // individually via examineSpot(). Only award non-spot clues here to avoid
    // gifting evidence the player never found, or double-awarding spot clues.
    const spotClueIds = new Set(
      (event.examinationSpots ?? []).map((s) => s.rewardsClueId).filter(Boolean) as string[],
    );
    const hasSpots = spotClueIds.size > 0;

    const allRewardIds = this.rewardClueIdsForEvent(event, pkg);
    // If the event uses examination spots, limit auto-awards to non-spot rewards only.
    const rewardClueIds = hasSpots
      ? allRewardIds.filter((id) => !spotClueIds.has(id))
      : allRewardIds;

    const unlockSuspectIds = event.unlocksSuspectIds ?? [];

    const newlyFoundClues = rewardClueIds
      .filter((id) => !state.foundClueIds.includes(id))
      .map((id) => pkg.clues.find((clue) => clue.id === id))
      .filter((clue): clue is Clue => !!clue);

    const newlyUnlockedSuspects = unlockSuspectIds
      .filter((id) => !state.unlockedSuspectIds.includes(id))
      .map((id) => pkg.suspects.find((suspect) => suspect.id === id))
      .filter((suspect): suspect is Suspect => !!suspect);

    this.gsvc.completeEvent(event.id);

    const clueIds: string[] = [];
    rewardClueIds.forEach((id) => {
      this.gsvc.discoverClue(id);
      clueIds.push(id);
    });
    newlyFoundClues.forEach((clue) => this.gsvc.visitLocation(clue.locationId));
    unlockSuspectIds.forEach((id) => this.gsvc.unlockSuspect(id));

    if (clueIds.length > 0) {
      this.recentClueIds.set(clueIds);
    }

    this.enqueueUnlockSpotlights(newlyFoundClues, newlyUnlockedSuspects);

    this.checkActProgression();
  }

  private rewardClueIdsForEvent(event: InvestigationEvent, pkg: CasePackage): string[] {
    const rewardIds = new Set(event.rewardsClueIds);
    const puzzleRewardId = event.puzzleId
      ? pkg.puzzles.find((puzzle) => puzzle.id === event.puzzleId)?.rewardedClueId
      : null;

    if (puzzleRewardId) {
      rewardIds.add(puzzleRewardId);
    }

    return [...rewardIds].filter((id) => pkg.clues.some((clue) => clue.id === id));
  }

  dismissUnlockSpotlight(): void {
    const next = this.unlockSpotlightQueue.shift() ?? null;
    this.unlockSpotlight.set(next);
  }

  private isReplayingEvent(eventId: string): boolean {
    return this.replayingEventId() === eventId;
  }

  private enqueueUnlockSpotlights(clues: Clue[], suspects: Suspect[]): void {
    for (const clue of clues) {
      this.unlockSpotlightQueue.push({ kind: 'clue', clue });
    }
    for (const suspect of suspects) {
      this.unlockSpotlightQueue.push({ kind: 'suspect', suspect });
    }

    if (!this.unlockSpotlight()) {
      this.dismissUnlockSpotlight();
    }
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
