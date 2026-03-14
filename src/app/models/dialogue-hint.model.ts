export interface DialogueLine {
  speakerId: string;
  speakerName: string;
  text: string;
  revealsTruth: boolean;
}

export interface Hint {
  index: number;
  text: string;
  targetsEventId?: string;
}

export interface SolutionExplanation {
  narrative: string;
  stepsExplained: string[];
  redHerringExplanations: string[];
}
