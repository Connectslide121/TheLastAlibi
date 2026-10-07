import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CaseStoreService } from '../../services/case-store.service';
import { GameStateService } from '../../services/game-state.service';
import { ImageService } from '../../services/image.service';
import {
  CasePackage,
  Suspect,
  Clue,
  EvidenceBoardNote,
  Location as GameLocation,
} from '../../models';

interface BoardCard {
  id: string;
  type: 'suspect' | 'clue' | 'location';
  label: string;
  sublabel: string;
  imageUrl?: string;
  hasContradiction: boolean;
  x: number;
  y: number;
}

interface ConnectionLine {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx: number;
  my: number; // midpoint for removal click target
}

const CARD_W = 140;
const CARD_H = 130; // approx card height for midpoint calc

@Component({
  selector: 'app-evidence-board-view',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="min-h-screen flex flex-col bg-(--color-primary)">
      <!-- Top Bar -->
      <header
        class="flex items-center gap-4 px-6 py-3 bg-(--color-surface) shrink-0"
        style="border-bottom: var(--border-style);"
      >
        <h1 class="font-heading text-lg text-(--color-accent) flex-1">Evidence Board</h1>
        @if (connectMode()) {
          <span
            class="font-mono text-xs px-3 py-1 rounded text-amber-400"
            style="border: 1px solid rgba(251,191,36,0.5); background: rgba(251,191,36,0.1);"
          >
            Click a second card to connect
          </span>
          <button
            type="button"
            (click)="cancelConnect()"
            class="px-3 py-1.5 text-xs font-mono uppercase tracking-widest rounded border cursor-pointer border-(--color-text-muted) text-(--color-text-muted) hover:opacity-80 transition-opacity flex items-center gap-1"
          >
            <span class="material-icons mi-sm">cancel</span>
            Cancel
          </button>
        } @else {
          <button
            type="button"
            (click)="enterConnectMode()"
            class="px-3 py-1.5 text-xs font-mono uppercase tracking-widest rounded border cursor-pointer border-(--color-accent) text-(--color-accent) hover:opacity-80 transition-opacity flex items-center gap-1"
          >
            <span class="material-icons mi-sm">link</span>
            Connect
          </button>
        }
        <span class="text-xs text-(--color-text-muted) font-mono hidden sm:flex items-center gap-1">
          <span class="material-icons mi-sm">note_add</span>
          Double-click board to add note
        </span>
        <button
          type="button"
          (click)="goBack()"
          class="px-3 py-1.5 text-xs font-mono uppercase tracking-widest rounded border cursor-pointer border-(--color-text-muted) text-(--color-text-muted) hover:opacity-80 transition-opacity flex items-center gap-1"
        >
          <span class="material-icons mi-sm">arrow_back</span>
          Investigation
        </button>
      </header>

      <!-- Board Canvas -->
      <div
        #board
        class="relative flex-1 select-none overflow-hidden"
        style="background: #4a2f16;
                  background-image: repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(0,0,0,0.06) 40px, rgba(0,0,0,0.06) 41px),
                                    repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(0,0,0,0.06) 40px, rgba(0,0,0,0.06) 41px);
                  min-height: calc(100vh - 3.5rem);"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp($event)"
        (pointerleave)="onPointerUp($event)"
        (dblclick)="onBoardDblClick($event)"
      >
        <!-- SVG Connection Lines -->
        <svg class="absolute inset-0 w-full h-full" style="z-index: 1; pointer-events: none;">
          <defs>
            <filter id="line-glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          @for (line of connectionLines(); track line.key) {
            <line
              [attr.x1]="line.x1"
              [attr.y1]="line.y1"
              [attr.x2]="line.x2"
              [attr.y2]="line.y2"
              stroke="rgba(201,168,76,0.55)"
              stroke-width="2"
              stroke-dasharray="8 5"
              filter="url(#line-glow)"
            />
            <!-- Invisible wider hit area for removal -->
            <line
              [attr.x1]="line.x1"
              [attr.y1]="line.y1"
              [attr.x2]="line.x2"
              [attr.y2]="line.y2"
              stroke="transparent"
              stroke-width="18"
              class="cursor-pointer"
              style="pointer-events: stroke;"
              (click)="removeConnection(line.key)"
            />
            <!-- Midpoint remove button -->
            <g
              class="cursor-pointer"
              style="pointer-events: all;"
              (click)="removeConnection(line.key)"
            >
              <circle
                [attr.cx]="line.mx"
                [attr.cy]="line.my"
                r="8"
                fill="#5c3d1e"
                stroke="rgba(201,168,76,0.5)"
                stroke-width="1"
              />
              <text
                [attr.x]="line.mx"
                [attr.y]="line.my + 4"
                text-anchor="middle"
                fill="rgba(201,168,76,0.8)"
                font-size="10"
              >
                ×
              </text>
            </g>
          }
        </svg>

        <!-- Board Cards -->
        @for (card of boardCards(); track card.id) {
          <div
            class="absolute rounded-lg cursor-pointer transition-transform"
            [style.left.px]="card.x"
            [style.top.px]="card.y"
            [style.z-index]="dragId() === card.id ? 100 : 2"
            [style.transform]="dragId() === card.id ? 'scale(1.05)' : 'scale(1)'"
            [style.outline]="
              connectMode() && firstConnectId() === card.id
                ? '2px solid var(--color-accent)'
                : 'none'
            "
            style="width: 140px; background: var(--color-secondary);
                      border: 1px solid rgba(201,168,76,0.3);
                      box-shadow: 0 4px 14px rgba(0,0,0,0.6);"
            (pointerdown)="onCardPointerDown($event, card)"
            (click)="onCardClick(card)"
          >
            <!-- Pin -->
            <div
              class="absolute -top-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs shadow-md"
              [style.background]="
                card.type === 'suspect' ? '#b91c1c' : card.type === 'clue' ? '#1d4ed8' : '#15803d'
              "
            >
              {{ card.type === 'suspect' ? '●' : card.type === 'clue' ? '◆' : '▲' }}
            </div>
            <!-- Contradiction marker -->
            @if (card.hasContradiction) {
              <div
                class="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-white shadow-md bg-red-600"
                title="Contradiction found"
              >
                <span class="material-icons" style="font-size: 12px; line-height: 1;"
                  >priority_high</span
                >
              </div>
            }
            @if (card.imageUrl) {
              <img
                [src]="card.imageUrl"
                [alt]="card.label"
                class="w-full h-20 object-cover rounded-t-lg pointer-events-none"
              />
            } @else {
              <div
                class="w-full h-12 rounded-t-lg flex items-center justify-center opacity-30"
                style="background: var(--color-surface);"
              >
                <span class="material-icons mi-xl text-(--color-text-muted)">{{
                  card.type === 'suspect' ? 'person' : 'search'
                }}</span>
              </div>
            }
            <div class="p-2">
              <p class="font-heading text-xs text-(--color-accent) leading-tight mb-0.5 truncate">
                {{ card.label }}
              </p>
              <p class="text-xs text-(--color-text-muted) leading-snug line-clamp-2">
                {{ card.sublabel }}
              </p>
            </div>
          </div>
        }

        <!-- Sticky Notes -->
        @for (note of boardNotes(); track note.id) {
          <div
            class="absolute rounded cursor-move"
            [style.left.px]="note.x"
            [style.top.px]="note.y"
            [style.z-index]="dragId() === note.id ? 100 : 3"
            style="width: 148px; min-height: 88px;
                      background: linear-gradient(135deg, #fef08a 0%, #fde047 100%);
                      box-shadow: 2px 4px 8px rgba(0,0,0,0.45), -1px -1px 0 rgba(255,255,255,0.3) inset;
                      transform: rotate(-1deg);"
            (pointerdown)="onNotePointerDown($event, note)"
          >
            <textarea
              class="w-full bg-transparent text-xs text-gray-800 resize-none outline-none font-mono leading-relaxed p-2"
              style="min-height: 72px;"
              [value]="note.text"
              (input)="updateNoteText(note.id, $any($event.target).value)"
              (pointerdown)="$event.stopPropagation()"
              placeholder="Write a note…"
            ></textarea>
            <button
              type="button"
              (click)="removeNote(note.id)"
              (pointerdown)="$event.stopPropagation()"
              class="absolute top-1 right-1 w-4 h-4 flex items-center justify-center cursor-pointer text-gray-500 hover:text-red-700 transition-colors"
            >
              <span class="material-icons" style="font-size: 14px;">close</span>
            </button>
          </div>
        }
      </div>

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
                  <span class="material-icons" style="font-size: 5rem; color: var(--color-text)"
                    >person</span
                  >
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
                  <span class="material-icons" style="font-size: 5rem; color: var(--color-text)"
                    >search</span
                  >
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
              style="aspect-ratio: 4/3; background: var(--color-surface)"
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
              @if (expandedLocation()!.cluesFoundHere.length) {
                <p class="font-mono text-xs" style="color: var(--color-text-muted)">
                  <span class="material-icons" style="font-size: 0.8rem; vertical-align: middle"
                    >search</span
                  >
                  {{ expandedLocation()!.cluesFoundHere.length }} clue(s) found here
                </p>
              }
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
              style="aspect-ratio: 4/3; background: var(--color-surface)"
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
              @if (expandedLocation()!.cluesFoundHere.length) {
                <p class="font-mono text-xs" style="color: var(--color-text-muted)">
                  <span class="material-icons" style="font-size: 0.8rem; vertical-align: middle"
                    >search</span
                  >
                  {{ expandedLocation()!.cluesFoundHere.length }} clue(s) found here
                </p>
              }
            </div>
          </div>
        </div>
      }

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
export class EvidenceBoardView implements OnInit {
  private readonly router = inject(Router);
  private readonly caseStore = inject(CaseStoreService);
  private readonly gsvc = inject(GameStateService);
  private readonly imageService = inject(ImageService);

  private readonly casePackage = signal<CasePackage | null>(null);

  readonly connectMode = signal(false);
  readonly firstConnectId = signal<string | null>(null);
  readonly dragId = signal<string | null>(null);
  readonly expandedSuspect = signal<Suspect | null>(null);
  readonly expandedClue = signal<Clue | null>(null);
  readonly expandedLocation = signal<GameLocation | null>(null);

  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private isDraggingNote = false;
  /** Tracks whether the pointer has moved since pointerdown — distinguishes drag from click. */
  private hasDragged = false;

  // -----------------------------------------------------------------------
  // Derived state
  // -----------------------------------------------------------------------

  readonly boardNotes = computed((): EvidenceBoardNote[] => {
    return this.gsvc.state()?.evidenceBoardNotes ?? [];
  });

  readonly boardCards = computed((): BoardCard[] => {
    const pkg = this.casePackage();
    const state = this.gsvc.state();
    if (!pkg || !state) return [];

    const positions = state.boardCardPositions ?? {};
    const contradictions = new Set(
      pkg.eventGraph
        .filter((e) => e.category === 'deduction' && state.completedEventIds.includes(e.id))
        .flatMap((e) => e.rewardsClueIds),
    );

    // Same visibility rule as the investigation and accusation views: anyone
    // unlocked or already interviewed.
    const visibleSuspectIds = [
      ...new Set([...state.unlockedSuspectIds, ...state.interviewedSuspectIds]),
    ];
    const suspects: BoardCard[] = visibleSuspectIds
      .map((id) => pkg.suspects.find((s) => s.id === id))
      .filter((s): s is Suspect => !!s)
      .map((s, i) => {
        const pos = positions[s.id] ?? { x: 50 + i * 160, y: 60 };
        return {
          id: s.id,
          type: 'suspect',
          label: s.name,
          sublabel: s.occupation,
          imageUrl: s.imageUrl,
          hasContradiction: state.contradictionEventIds.some((eid) =>
            pkg.eventGraph.find(
              (e) =>
                e.id === eid &&
                (e.dialogueSuspectId === s.id || e.unlocksSuspectIds?.includes(s.id)),
            ),
          ),
          x: pos.x,
          y: pos.y,
        };
      });

    const clues: BoardCard[] = state.foundClueIds
      .map((id) => pkg.clues.find((c) => c.id === id))
      .filter((c): c is Clue => !!c)
      .map((c, i) => {
        const pos = positions[c.id] ?? { x: 50 + i * 160, y: 340 };
        return {
          id: c.id,
          type: 'clue',
          label: c.name,
          sublabel: c.description.slice(0, 50),
          imageUrl: c.imageUrl,
          hasContradiction: contradictions.has(c.id),
          x: pos.x,
          y: pos.y,
        };
      });

    const completedEventIds = new Set(state.completedEventIds);
    const foundClueIds = new Set(state.foundClueIds);
    const locations: BoardCard[] = pkg.locations
      .filter((loc) => {
        const clueIds = new Set(pkg.clues.filter((c) => c.locationId === loc.id).map((c) => c.id));
        const locEvents = pkg.eventGraph.filter((e) =>
          e.rewardsClueIds.some((id) => clueIds.has(id)),
        );
        return (
          locEvents.some((e) => completedEventIds.has(e.id)) ||
          pkg.clues.filter((c) => c.locationId === loc.id).some((c) => foundClueIds.has(c.id))
        );
      })
      .map((loc, i) => {
        const pos = positions[loc.id] ?? { x: 50 + i * 160, y: 620 };
        return {
          id: loc.id,
          type: 'location' as const,
          label: loc.name,
          sublabel: loc.atmosphere.slice(0, 60),
          imageUrl: loc.imageUrl,
          hasContradiction: false,
          x: pos.x,
          y: pos.y,
        };
      });

    return [...suspects, ...clues, ...locations];
  });

  readonly connectionLines = computed((): ConnectionLine[] => {
    const cards = this.boardCards();
    const cardMap = new Map(cards.map((c) => [c.id, c]));
    const connections = this.gsvc.state()?.boardConnections ?? [];

    return connections
      .map((key) => {
        const [a, b] = key.split(':');
        const ca = cardMap.get(a);
        const cb = cardMap.get(b);
        if (!ca || !cb) return null;
        const x1 = ca.x + CARD_W / 2;
        const y1 = ca.y + CARD_H / 2;
        const x2 = cb.x + CARD_W / 2;
        const y2 = cb.y + CARD_H / 2;
        return { key, x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
      })
      .filter((l): l is ConnectionLine => !!l);
  });

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  ngOnInit(): void {
    const sessionId = this.gsvc.state()?.sessionId;
    if (!sessionId) {
      void this.router.navigate(['/']);
      return;
    }
    this.caseStore.loadCase(sessionId).subscribe((pkg) => {
      if (pkg) {
        this.casePackage.set(pkg);
        // Re-hydrate blob URLs from IndexedDB image cache (they don't survive page refresh)
        this.imageService.generateAllCaseImages(pkg).subscribe({
          next: (updated) => this.casePackage.set(updated),
        });
      }
    });
  }

  // -----------------------------------------------------------------------
  // Board interactions
  // -----------------------------------------------------------------------

  onBoardDblClick(event: MouseEvent): void {
    // Only create a note when double-clicking the board background itself
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'DIV' &&
      !target.closest('[style*="width: 140"]') &&
      !target.closest('[style*="width: 148"]')
    ) {
      this.addNoteAt(event.offsetX, event.offsetY);
    }
  }

  onCardPointerDown(event: PointerEvent, card: BoardCard): void {
    event.stopPropagation();
    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    this.hasDragged = false;
    this.dragId.set(card.id);
    this.dragOffsetX = event.clientX - card.x;
    this.dragOffsetY = event.clientY - card.y;
    this.isDraggingNote = false;
  }

  onNotePointerDown(event: PointerEvent, note: EvidenceBoardNote): void {
    event.stopPropagation();
    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    this.hasDragged = false;
    this.dragId.set(note.id);
    this.dragOffsetX = event.clientX - note.x;
    this.dragOffsetY = event.clientY - note.y;
    this.isDraggingNote = true;
  }

  onPointerMove(event: PointerEvent): void {
    const id = this.dragId();
    if (!id) return;

    const newX = Math.max(0, event.clientX - this.dragOffsetX);
    const newY = Math.max(46, event.clientY - this.dragOffsetY); // keep below header

    // Mark as dragged once moved > 4px to avoid treating micro-movements as drags
    if (!this.hasDragged) {
      const dx =
        event.clientX -
        (this.dragOffsetX +
          (this.isDraggingNote
            ? (this.boardNotes().find((n) => n.id === id)?.x ?? 0)
            : (this.boardCards().find((c) => c.id === id)?.x ?? 0)));
      const dy =
        event.clientY -
        (this.dragOffsetY +
          (this.isDraggingNote
            ? (this.boardNotes().find((n) => n.id === id)?.y ?? 0)
            : (this.boardCards().find((c) => c.id === id)?.y ?? 0)));
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) this.hasDragged = true;
    }

    if (this.isDraggingNote) {
      const note = this.boardNotes().find((n) => n.id === id);
      if (note) this.gsvc.updateEvidenceBoardNote({ ...note, x: newX, y: newY });
    } else {
      this.gsvc.setBoardCardPosition(id, newX, newY);
    }
  }

  onPointerUp(event: PointerEvent): void {
    this.dragId.set(null);
    this.isDraggingNote = false;
    // Do NOT reset hasDragged here — click fires after pointerup and needs to read it.
    // hasDragged is reset at the next pointerdown instead.
  }

  onCardClick(card: BoardCard): void {
    if (this.hasDragged) return; // was a drag

    if (this.connectMode()) {
      const first = this.firstConnectId();
      if (!first) {
        this.firstConnectId.set(card.id);
      } else if (first !== card.id) {
        this.gsvc.addBoardConnection(first, card.id);
        this.connectMode.set(false);
        this.firstConnectId.set(null);
      }
      return;
    }

    // Open detail modal
    const pkg = this.casePackage();
    if (!pkg) return;
    if (card.type === 'suspect') {
      const suspect = pkg.suspects.find((s) => s.id === card.id) ?? null;
      this.expandedSuspect.set(suspect);
    } else if (card.type === 'clue') {
      const clue = pkg.clues.find((c) => c.id === card.id) ?? null;
      this.expandedClue.set(clue);
    } else {
      const location = pkg.locations.find((l) => l.id === card.id) ?? null;
      this.expandedLocation.set(location);
    }
  }

  removeConnection(key: string): void {
    this.gsvc.removeBoardConnection(key);
  }

  enterConnectMode(): void {
    this.connectMode.set(true);
    this.firstConnectId.set(null);
  }

  cancelConnect(): void {
    this.connectMode.set(false);
    this.firstConnectId.set(null);
  }

  // -----------------------------------------------------------------------
  // Notes
  // -----------------------------------------------------------------------

  addNoteAt(x: number, y: number): void {
    const note: EvidenceBoardNote = {
      id: `note-${Date.now()}`,
      text: '',
      x,
      y,
      connectedToIds: [],
    };
    this.gsvc.addEvidenceBoardNote(note);
  }

  updateNoteText(noteId: string, text: string): void {
    const note = this.boardNotes().find((n) => n.id === noteId);
    if (note) this.gsvc.updateEvidenceBoardNote({ ...note, text });
  }

  removeNote(noteId: string): void {
    this.gsvc.removeEvidenceBoardNote(noteId);
  }

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  goBack(): void {
    void this.router.navigate(['/investigation']);
  }

  isInterviewed(suspectId: string): boolean {
    return this.gsvc.state()?.interviewedSuspectIds.includes(suspectId) ?? false;
  }

  clueLocationName(locationId: string): string {
    return this.casePackage()?.locations.find((l) => l.id === locationId)?.name ?? locationId;
  }
}
