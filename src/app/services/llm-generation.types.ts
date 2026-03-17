import {
  CaseMetadata,
  Clue,
  InvestigationEvent,
  UnlockCondition,
  ExaminationSpot,
  PuzzleEvent,
  Hint,
  SolutionExplanation,
  VisualDirection,
  UITheme,
  ImagePromptTemplates,
  TimelineEvent,
  Suspect,
} from '../models';
import { DebugRequestMeta } from './debug-trace.service';

export type Difficulty = CaseMetadata['difficulty'];

// ── Step-output interfaces ────────────────────────────────────────────────────

export interface CaseFoundation {
  caseSlug: string;
  title: string;
  subtitle: string;
  caseType: CaseMetadata['caseType'];
  setting: string;
  briefing: string;
  act1Summary: string;
  act2Summary: string;
  act3Summary: string;
  culpritLabel: string;
  motive: string;
  method: string;
  trueTimeline: string;
  keyContradiction: string;
  redHerringExplanation: string;
  suspectLabels: string[];
  lyingSuspectLabels: string[];
  mistakenSuspectLabels: string[];
  hidingSecretSuspectLabels: string[];
}

export interface LocationSpec {
  id: string;
  name: string;
  description: string;
  atmosphere: string;
  imagePrompt: string;
}

export interface CluesResult {
  clues: Clue[];
  culpritClueIds: string[];
  redHerringClueIds: string[];
  importantClueId: string;
}

export interface EventSpec {
  id: string;
  category: InvestigationEvent['category'];
  type: string;
  title: string;
  description: string;
  act: 1 | 2 | 3;
  isMandatory: boolean;
  unlockConditions: UnlockCondition[];
  rewardsClueIds: string[];
  unlocksSuspectIds: string[];
  puzzleLabel: string | null;
  dialogueSuspectId: string | null;
  narration: string;
  examinationSpots: ExaminationSpot[] | null;
}

export interface PuzzleConcept {
  label: string;
  id: string;
  rewardedClueId: string;
  puzzleTitle: string;
  puzzleType: PuzzleEvent['type'];
  puzzleDescription: string;
  puzzleLogic: string;
  derivationSteps: string[];
  interactionInstructions: string;
  clues: string[];
  answerPrompt: string;
  answerPlaceholder: string;
  answerFormat: string;
  solution: string;
  acceptableAnswers: string[];
  validationLogic: string;
  uiConcept: string;
  hints: string[];
}

export interface VisualResult {
  visualDirection: VisualDirection;
  uiTheme: UITheme;
  imagePromptTemplates: ImagePromptTemplates;
}

export interface HintResult {
  hintLadder: Hint[];
  solutionExplanation: SolutionExplanation;
}

export interface GenCtx {
  difficulty: Difficulty;
  style: string;
  foundation: CaseFoundation;
  culpritSuspectId: string;
  suspects: Suspect[];
  locations: LocationSpec[];
  clues: CluesResult;
  visual: VisualResult;
  timeline: TimelineEvent[];
  events: EventSpec[];
  puzzleConcepts: PuzzleConcept[];
  hintsAndSolution: HintResult;
  puzzles: PuzzleEvent[];
}

// ── LLM call options ──────────────────────────────────────────────────────────

export interface LlmCallOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  debugMeta?: DebugRequestMeta;
}

// ── Generation step UI ────────────────────────────────────────────────────────

export interface GenerationStepStatus {
  label: string;
  detail: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

export const STEP_DEFS: Omit<GenerationStepStatus, 'status'>[] = [
  { label: 'Case Foundation', detail: 'Setting, premise, culprit & motive' },
  { label: 'Suspects', detail: 'Character profiles & interview dialogue' },
  { label: 'Locations', detail: 'Crime scene & surrounding areas' },
  { label: 'Clues & Evidence', detail: 'Physical evidence and red herrings' },
  { label: 'Visual Theme', detail: 'Colour palette, art style & UI skin' },
  { label: 'Timeline', detail: '10-entry chronological event log' },
  { label: 'Investigation Events', detail: 'Interactive event graph across 3 acts' },
  { label: 'Puzzle Concepts', detail: 'Puzzle logic, clues & intended solution' },
  { label: 'Hint Ladder', detail: 'Progressive hints & solution narrative' },
  { label: 'Puzzle Components', detail: 'Self-contained interactive HTML puzzles' },
  { label: 'Final Assembly', detail: 'Stitching all pieces into the case file' },
  { label: 'Generating Images', detail: 'Illustrating suspects, locations & evidence' },
];

export function makeSteps(): GenerationStepStatus[] {
  return STEP_DEFS.map((s, i) => ({ ...s, status: i === 0 ? 'active' : 'pending' }));
}
