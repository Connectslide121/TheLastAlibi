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
  htmlComponent: string;
  solutionCondition: string;
  rewardedClueId: string;
  hints: string[];
}
