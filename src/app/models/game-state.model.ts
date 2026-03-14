export interface FinalAccusation {
  culpritId: string;
  motive: string;
  method: string;
  evidenceIds: string[];
}

export interface EvidenceBoardNote {
  id: string;
  text: string;
  x: number;
  y: number;
  connectedToIds: string[];
}

export interface GameState {
  sessionId: string;
  completedEventIds: string[];
  visitedLocationIds: string[];
  foundClueIds: string[];
  completedPuzzleIds: string[];
  interviewedSuspectIds: string[];
  unlockedSuspectIds: string[];
  currentAct: 1 | 2 | 3;
  actionsCount: number;
  isAccusationUnlocked: boolean;
  hintsUsed: number;
  finalAccusation?: FinalAccusation;
  evidenceBoardNotes: EvidenceBoardNote[];
  /** Keyed by card ID (suspect or clue) — persisted board layout */
  boardCardPositions: Record<string, { x: number; y: number }>;
  /** Sorted 'id1:id2' pairs representing drawn connections */
  boardConnections: string[];
  /** IDs of events that revealed a contradiction */
  contradictionEventIds: string[];
}
