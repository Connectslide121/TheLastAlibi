import { Component, OnInit, signal, computed, inject, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CaseStoreService } from '../../services/case-store.service';
import { GameStateService } from '../../services/game-state.service';
import { ToastService } from '../../components';
import { CasePackage, Suspect, Clue, EvidenceBoardNote } from '../../models';

interface BoardCard {
  id: string;
  type: 'suspect' | 'clue';
  label: string;
  sublabel: string;
  imageUrl?: string;
  x: number;
  y: number;
  connectedToIds: string[];
}

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
            Select a second card to connect
          </span>
          <button
            type="button"
            (click)="cancelConnect()"
            class="px-3 py-1.5 text-xs font-mono uppercase tracking-widest rounded border cursor-pointer border-(--color-text-muted) text-(--color-text-muted) hover:opacity-80 transition-opacity"
          >
            Cancel
          </button>
        } @else {
          <button
            type="button"
            (click)="addNote()"
            class="px-3 py-1.5 text-xs font-mono uppercase tracking-widest rounded border cursor-pointer border-(--color-accent) text-(--color-accent) hover:opacity-80 transition-opacity"
          >
            + Add Note
          </button>
        }
        <button
          type="button"
          (click)="goBack()"
          class="px-3 py-1.5 text-xs font-mono uppercase tracking-widest rounded border cursor-pointer border-(--color-text-muted) text-(--color-text-muted) hover:opacity-80 transition-opacity"
        >
          ← Investigation
        </button>
      </header>

      <!-- Board Canvas -->
      <div
        class="relative flex-1 overflow-hidden cursor-default select-none"
        style="background: #5c3d1e; background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px); min-height: calc(100vh - 3.5rem);"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp()"
        (pointerleave)="onPointerUp()"
      >
        <!-- SVG Connection Lines -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none" style="z-index: 1;">
          @for (line of connectionLines(); track line.key) {
            <line
              [attr.x1]="line.x1"
              [attr.y1]="line.y1"
              [attr.x2]="line.x2"
              [attr.y2]="line.y2"
              stroke="rgba(201,168,76,0.6)"
              stroke-width="2"
              stroke-dasharray="6 4"
            />
          }
        </svg>

        <!-- Board Cards -->
        @for (card of boardCards(); track card.id) {
          <div
            class="absolute rounded-lg p-3 cursor-pointer transition-transform"
            [style.left.px]="card.x"
            [style.top.px]="card.y"
            [style.z-index]="dragId() === card.id ? 100 : 2"
            [style.transform]="dragId() === card.id ? 'scale(1.04)' : 'scale(1)'"
            [style.box-shadow]="
              firstConnectId() === card.id
                ? '0 0 0 3px rgba(201,168,76,0.8)'
                : '0 4px 12px rgba(0,0,0,0.5)'
            "
            style="width: 140px; background: var(--color-secondary); border: 1px solid rgba(201,168,76,0.35);"
            (pointerdown)="onPointerDown($event, card)"
            (click)="onCardClick(card)"
          >
            <!-- Pin -->
            <div
              class="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full"
              [style.background]="card.type === 'suspect' ? '#b91c1c' : '#1d4ed8'"
            ></div>
            @if (card.imageUrl) {
              <img
                [src]="card.imageUrl"
                alt=""
                class="w-full h-20 object-cover rounded mb-1.5 pointer-events-none"
              />
            }
            <p class="font-heading text-xs text-(--color-accent) leading-tight mb-0.5">
              {{ card.label }}
            </p>
            <p class="text-xs text-(--color-text-muted) leading-tight">{{ card.sublabel }}</p>
            <span class="inline-block mt-1 text-xs font-mono opacity-40">
              {{ card.type === 'suspect' ? '🧑' : '🔍' }}
            </span>
          </div>
        }

        <!-- Sticky Notes -->
        @for (note of boardNotes(); track note.id) {
          <div
            class="absolute rounded p-2 cursor-move"
            [style.left.px]="note.x"
            [style.top.px]="note.y"
            [style.z-index]="dragId() === note.id ? 100 : 3"
            style="width: 140px; min-height: 80px; background: #fef08a; box-shadow: 2px 2px 6px rgba(0,0,0,0.4);"
            (pointerdown)="onPointerDown($event, note, true)"
          >
            <textarea
              class="w-full h-full bg-transparent text-xs text-gray-800 resize-none outline-none font-mono leading-relaxed"
              style="min-height: 64px;"
              [value]="note.text"
              (input)="updateNoteText(note.id, $any($event.target).value)"
              (pointerdown)="$event.stopPropagation()"
              placeholder="Write a note…"
            ></textarea>
            <button
              type="button"
              (click)="removeNote(note.id)"
              (pointerdown)="$event.stopPropagation()"
              class="absolute top-1 right-1 w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-800 cursor-pointer text-xs leading-none"
            >
              ×
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class EvidenceBoardView implements OnInit {
  private readonly router = inject(Router);
  private readonly caseStore = inject(CaseStoreService);
  private readonly gsvc = inject(GameStateService);
  private readonly toast = inject(ToastService);

  private readonly casePackage = signal<CasePackage | null>(null);

  readonly connectMode = signal(false);
  readonly firstConnectId = signal<string | null>(null);
  readonly dragId = signal<string | null>(null);
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private isDraggingNote = false;

  // Local card positions (not persisted — Phase 5 will add persistence)
  private readonly cardPositions = signal<Map<string, { x: number; y: number }>>(new Map());
  private readonly localConnections = signal<string[]>([]); // "id1:id2" pairs

  readonly boardNotes = computed((): EvidenceBoardNote[] => {
    return this.gsvc.state()?.evidenceBoardNotes ?? [];
  });

  readonly boardCards = computed((): BoardCard[] => {
    const pkg = this.casePackage();
    const state = this.gsvc.state();
    if (!pkg || !state) return [];

    const positions = this.cardPositions();
    const connections = this.localConnections();

    const suspects: BoardCard[] = state.unlockedSuspectIds
      .map((id) => pkg.suspects.find((s) => s.id === id))
      .filter((s): s is Suspect => !!s)
      .map((s, i) => {
        const pos = positions.get(s.id) ?? { x: 50 + i * 160, y: 60 };
        const connectedToIds = connections
          .filter((c) => c.startsWith(`${s.id}:`) || c.endsWith(`:${s.id}`))
          .map((c) =>
            c.startsWith(`${s.id}:`) ? c.slice(s.id.length + 1) : c.slice(0, c.indexOf(':')),
          );
        return {
          id: s.id,
          type: 'suspect',
          label: s.name,
          sublabel: s.occupation,
          imageUrl: s.imageUrl,
          x: pos.x,
          y: pos.y,
          connectedToIds,
        };
      });

    const clues: BoardCard[] = state.foundClueIds
      .map((id) => pkg.clues.find((c) => c.id === id))
      .filter((c): c is Clue => !!c)
      .map((c, i) => {
        const pos = positions.get(c.id) ?? { x: 50 + i * 160, y: 320 };
        const connectedToIds = connections
          .filter((conn) => conn.startsWith(`${c.id}:`) || conn.endsWith(`:${c.id}`))
          .map((conn) =>
            conn.startsWith(`${c.id}:`)
              ? conn.slice(c.id.length + 1)
              : conn.slice(0, conn.indexOf(':')),
          );
        return {
          id: c.id,
          type: 'clue',
          label: c.name,
          sublabel: c.description.slice(0, 40) + '…',
          imageUrl: c.imageUrl,
          x: pos.x,
          y: pos.y,
          connectedToIds,
        };
      });

    return [...suspects, ...clues];
  });

  readonly connectionLines = computed(() => {
    const cards = this.boardCards();
    const cardMap = new Map(cards.map((c) => [c.id, c]));
    return this.localConnections()
      .map((key) => {
        const [a, b] = key.split(':');
        const ca = cardMap.get(a);
        const cb = cardMap.get(b);
        if (!ca || !cb) return null;
        return {
          key,
          x1: ca.x + 70,
          y1: ca.y + 50,
          x2: cb.x + 70,
          y2: cb.y + 50,
        };
      })
      .filter((l): l is NonNullable<typeof l> => !!l);
  });

  ngOnInit(): void {
    const sessionId = this.gsvc.state()?.sessionId;
    if (!sessionId) {
      void this.router.navigate(['/']);
      return;
    }
    this.caseStore.loadCase(sessionId).subscribe((pkg) => {
      if (pkg) this.casePackage.set(pkg);
    });
  }

  onCardClick(card: BoardCard): void {
    if (this.dragId()) return; // was a drag, not a click

    if (this.connectMode()) {
      const first = this.firstConnectId();
      if (!first) {
        this.firstConnectId.set(card.id);
      } else if (first !== card.id) {
        const key = [first, card.id].sort().join(':');
        const existing = this.localConnections();
        if (!existing.includes(key)) {
          this.localConnections.set([...existing, key]);
        }
        this.connectMode.set(false);
        this.firstConnectId.set(null);
      }
    }
  }

  cancelConnect(): void {
    this.connectMode.set(false);
    this.firstConnectId.set(null);
  }

  addNote(): void {
    const note: EvidenceBoardNote = {
      id: `note-${Date.now()}`,
      text: '',
      x: 200 + Math.random() * 200,
      y: 200 + Math.random() * 100,
      connectedToIds: [],
    };
    this.gsvc.addEvidenceBoardNote(note);
  }

  updateNoteText(noteId: string, text: string): void {
    const note = this.boardNotes().find((n) => n.id === noteId);
    if (note) {
      this.gsvc.updateEvidenceBoardNote({ ...note, text });
    }
  }

  removeNote(noteId: string): void {
    this.gsvc.removeEvidenceBoardNote(noteId);
  }

  onPointerDown(event: PointerEvent, item: BoardCard | EvidenceBoardNote, isNote = false): void {
    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    this.dragId.set(item.id);
    this.dragOffsetX = event.clientX - item.x;
    this.dragOffsetY = event.clientY - item.y;
    this.isDraggingNote = isNote;
  }

  onPointerMove(event: PointerEvent): void {
    const id = this.dragId();
    if (!id) return;
    const newX = Math.max(0, event.clientX - this.dragOffsetX);
    const newY = Math.max(0, event.clientY - this.dragOffsetY);

    if (this.isDraggingNote) {
      const note = this.boardNotes().find((n) => n.id === id);
      if (note) {
        this.gsvc.updateEvidenceBoardNote({ ...note, x: newX, y: newY });
      }
    } else {
      const current = new Map(this.cardPositions());
      current.set(id, { x: newX, y: newY });
      this.cardPositions.set(current);
    }
  }

  onPointerUp(): void {
    this.dragId.set(null);
    this.isDraggingNote = false;
  }

  goBack(): void {
    void this.router.navigate(['/investigation']);
  }
}
