export interface TruthLayer {
  culpritId: string;
  motive: string;
  method: string;
  trueTimeline: string;
  keyContradiction: string;
  importantClueId: string;
  redHerringExplanation: string;
  lyingSuspectIds: string[];
  mistakenSuspectIds: string[];
  hidingSecretSuspectIds: string[];
  revealingClueIds: string[];
  redHerringClueIds: string[];
}
