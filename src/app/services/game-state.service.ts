import { Injectable, signal, computed } from '@angular/core';
import {
  GameState,
  FinalAccusation,
  EvidenceBoardNote,
  CasePackage,
  InvestigationEvent,
  UnlockCondition,
} from '../models';

const STORAGE_KEY = 'tla_game_state';

@Injectable({ providedIn: 'root' })
export class GameStateService {
  // Reactive state exposed as a signal
  private readonly _state = signal<GameState | null>(null);

  readonly state = this._state.asReadonly();
  readonly currentAct = computed(() => this._state()?.currentAct ?? 1);
  readonly isAccusationUnlocked = computed(() => this._state()?.isAccusationUnlocked ?? false);

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  initState(sessionId: string): void {
    const fresh: GameState = {
      sessionId,
      completedEventIds: [],
      visitedLocationIds: [],
      foundClueIds: [],
      completedPuzzleIds: [],
      interviewedSuspectIds: [],
      unlockedSuspectIds: [],
      currentAct: 1,
      actionsCount: 0,
      isAccusationUnlocked: false,
      evidenceBoardNotes: [],
      hintsUsed: 0,
    };
    this._state.set(fresh);
    this.persist(fresh);
  }

  saveState(state: GameState): void {
    this._state.set(state);
    this.persist(state);
  }

  loadState(sessionId: string): GameState | null {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${sessionId}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as GameState;
      this._state.set(parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  clearState(): void {
    const s = this._state();
    if (s) {
      localStorage.removeItem(`${STORAGE_KEY}_${s.sessionId}`);
    }
    this._state.set(null);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getAvailableEvents(casePackage: CasePackage, state: GameState): InvestigationEvent[] {
    return casePackage.eventGraph.filter((event) => {
      if (state.completedEventIds.includes(event.id)) return false;
      if (event.act > state.currentAct) return false;
      return event.unlockConditions.every((cond: UnlockCondition) =>
        this.evaluateCondition(cond, state),
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Actions – each mutates state and persists
  // ---------------------------------------------------------------------------

  completeEvent(eventId: string): void {
    this.mutate((s) => {
      if (!s.completedEventIds.includes(eventId)) {
        s.completedEventIds.push(eventId);
        s.actionsCount++;
      }
    });
  }

  discoverClue(clueId: string): void {
    this.mutate((s) => {
      if (!s.foundClueIds.includes(clueId)) {
        s.foundClueIds.push(clueId);
      }
    });
  }

  completePuzzle(puzzleId: string): void {
    this.mutate((s) => {
      if (!s.completedPuzzleIds.includes(puzzleId)) {
        s.completedPuzzleIds.push(puzzleId);
        s.actionsCount++;
      }
    });
  }

  visitLocation(locationId: string): void {
    this.mutate((s) => {
      if (!s.visitedLocationIds.includes(locationId)) {
        s.visitedLocationIds.push(locationId);
        s.actionsCount++;
      }
    });
  }

  interviewSuspect(suspectId: string): void {
    this.mutate((s) => {
      if (!s.interviewedSuspectIds.includes(suspectId)) {
        s.interviewedSuspectIds.push(suspectId);
        s.actionsCount++;
      }
    });
  }

  unlockSuspect(suspectId: string): void {
    this.mutate((s) => {
      if (!s.unlockedSuspectIds.includes(suspectId)) {
        s.unlockedSuspectIds.push(suspectId);
      }
    });
  }

  advanceAct(): void {
    this.mutate((s) => {
      if (s.currentAct < 3) {
        s.currentAct = (s.currentAct + 1) as 1 | 2 | 3;
      }
    });
  }

  unlockAccusation(): void {
    this.mutate((s) => {
      s.isAccusationUnlocked = true;
    });
  }

  submitAccusation(accusation: FinalAccusation, casePackage: CasePackage): boolean {
    const correct =
      accusation.culpritId === casePackage.truth.culpritId &&
      accusation.method.trim().toLowerCase() === casePackage.truth.method.trim().toLowerCase();

    this.mutate((s) => {
      s.finalAccusation = accusation;
    });

    return correct;
  }

  useHint(): void {
    this.mutate((s) => {
      s.hintsUsed++;
    });
  }

  addEvidenceBoardNote(note: EvidenceBoardNote): void {
    this.mutate((s) => {
      s.evidenceBoardNotes.push(note);
    });
  }

  updateEvidenceBoardNote(note: EvidenceBoardNote): void {
    this.mutate((s) => {
      const idx = s.evidenceBoardNotes.findIndex((n) => n.id === note.id);
      if (idx !== -1) {
        s.evidenceBoardNotes[idx] = note;
      }
    });
  }

  removeEvidenceBoardNote(noteId: string): void {
    this.mutate((s) => {
      s.evidenceBoardNotes = s.evidenceBoardNotes.filter((n) => n.id !== noteId);
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private mutate(updater: (draft: GameState) => void): void {
    const current = this._state();
    if (!current) return;
    // Shallow clone to trigger signal change detection
    const draft = { ...current };
    updater(draft);
    this._state.set(draft);
    this.persist(draft);
  }

  private persist(state: GameState): void {
    localStorage.setItem(`${STORAGE_KEY}_${state.sessionId}`, JSON.stringify(state));
  }

  private evaluateCondition(condition: UnlockCondition, state: GameState): boolean {
    switch (condition.type) {
      case 'event_completed':
        return state.completedEventIds.includes(condition.referenceId);
      case 'clue_found':
        return state.foundClueIds.includes(condition.referenceId);
      case 'act_reached':
        return state.currentAct >= Number(condition.referenceId);
      default:
        return true;
    }
  }
}
