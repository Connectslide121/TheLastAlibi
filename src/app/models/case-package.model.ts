import { CaseMetadata } from './case-metadata.model';
import { TruthLayer } from './truth-layer.model';
import { Suspect } from './suspect.model';
import { Location } from './location.model';
import { Clue } from './clue.model';
import { TimelineEvent } from './timeline-event.model';
import { InvestigationEvent } from './investigation-event.model';
import { PuzzleEvent } from './puzzle-event.model';
import { Hint, SolutionExplanation } from './dialogue-hint.model';
import { VisualDirection } from './visual-direction.model';
import { UITheme } from './ui-theme.model';
import { ImagePromptTemplates } from './image-prompt-templates.model';

export interface CasePackage {
  id: string;
  metadata: CaseMetadata;
  truth: TruthLayer;
  suspects: Suspect[];
  locations: Location[];
  clues: Clue[];
  timeline: TimelineEvent[];
  eventGraph: InvestigationEvent[];
  puzzles: PuzzleEvent[];
  hintLadder: Hint[];
  solutionExplanation: SolutionExplanation;
  visualDirection: VisualDirection;
  uiTheme: UITheme;
  imagePromptTemplates: ImagePromptTemplates;
  generatedAt: string;
}
