export interface PuzzleEvent {
  id: string;
  type:
    | 'cipher'
    | 'lock'
    | 'pattern'
    | 'fragment'
    | 'logic_grid'
    | 'sequence'
    | 'map'
    | 'mechanical';
  title: string;
  description: string;
  interactionInstructions: string;
  visibleClues: string[];
  answerPrompt: string;
  answerPlaceholder: string;
  answerFormat: string;
  acceptableAnswers: string[];
  validationLogic: string;
  uiConcept: string;
  htmlComponent: string;
  solutionCondition: string;
  rewardedClueId: string;
  hints: string[];
}
