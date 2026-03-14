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
}
