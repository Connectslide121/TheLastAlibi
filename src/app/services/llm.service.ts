import { Injectable, inject, signal } from '@angular/core';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import {
  CasePackage,
  CaseMetadata,
  TruthLayer,
  Suspect,
  Location,
  Clue,
  TimelineEvent,
  InvestigationEvent,
  UnlockCondition,
  PuzzleEvent,
  Hint,
  SolutionExplanation,
  VisualDirection,
  UITheme,
  ImagePromptTemplates,
} from '../models';
import { DebugRequestMeta } from './debug-trace.service';
import { WorkerLlmService } from './worker-llm';

type Difficulty = CaseMetadata['difficulty'];

// â”€â”€ Internal step-output interfaces â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface CaseFoundation {
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

interface LocationSpec {
  id: string;
  name: string;
  description: string;
  atmosphere: string;
  imagePrompt: string;
}

interface CluesResult {
  clues: Clue[];
  culpritClueIds: string[];
  redHerringClueIds: string[];
  importantClueId: string;
}

interface EventSpec {
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
}

interface PuzzleConcept {
  label: string;
  id: string;
  rewardedClueId: string;
  puzzleTitle: string;
  puzzleType: PuzzleEvent['type'];
  puzzleDescription: string;
  puzzleLogic: string;
  clues: string[];
  solution: string;
  validationLogic: string;
  uiConcept: string;
  hints: string[];
}

interface VisualResult {
  visualDirection: VisualDirection;
  uiTheme: UITheme;
  imagePromptTemplates: ImagePromptTemplates;
}

interface HintResult {
  hintLadder: Hint[];
  solutionExplanation: SolutionExplanation;
}

interface GenCtx {
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

export interface GenerationStepStatus {
  label: string;
  detail: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

interface LlmCallOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  debugMeta?: DebugRequestMeta;
}

const STEP_DEFS: Omit<GenerationStepStatus, 'status'>[] = [
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

function makeSteps(): GenerationStepStatus[] {
  return STEP_DEFS.map((s, i) => ({ ...s, status: i === 0 ? 'active' : 'pending' }));
}

@Injectable({ providedIn: 'root' })
export class LlmService {
  private readonly workerLlm = inject(WorkerLlmService);

  readonly generationSteps = signal<GenerationStepStatus[]>(makeSteps());

  private markDone(...indices: number[]): void {
    this.generationSteps.update((steps) => {
      const next = [...steps];
      for (const idx of indices) {
        if (idx < next.length) next[idx] = { ...next[idx], status: 'done' };
      }
      // Mark the first pending step after the done ones as active
      const firstPending = next.findIndex((s) => s.status === 'pending');
      if (firstPending !== -1) next[firstPending] = { ...next[firstPending], status: 'active' };
      return next;
    });
  }

  markImageStepActive(): void {
    const idx = STEP_DEFS.length - 1; // last step
    this.generationSteps.update((steps) => {
      const next = [...steps];
      next[idx] = { ...next[idx], status: 'active' };
      return next;
    });
  }

  markImageStepDone(): void {
    const idx = STEP_DEFS.length - 1;
    this.generationSteps.update((steps) => {
      const next = [...steps];
      next[idx] = { ...next[idx], status: 'done' };
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  generateCasePackage(difficulty: Difficulty, stylePreference: string): Observable<CasePackage> {
    this.generationSteps.set(makeSteps());

    return this.step1Foundation(difficulty, stylePreference).pipe(
      switchMap((foundation) => {
        this.markDone(0);
        return forkJoin({
          suspectsResult: this.step2Suspects(foundation, stylePreference),
          locations: this.step3Locations(foundation),
        }).pipe(
          map((r) => {
            this.markDone(1, 2);
            return {
              difficulty,
              style: stylePreference,
              foundation,
              culpritSuspectId: r.suspectsResult.culpritSuspectId,
              suspects: r.suspectsResult.suspects,
              locations: r.locations,
            };
          }),
        );
      }),
      switchMap((ctx) => {
        return forkJoin({
          clues: this.step4Clues(ctx.foundation, ctx.culpritSuspectId, ctx.suspects, ctx.locations),
          visual: this.step9Visual(ctx.foundation, ctx.suspects, ctx.style),
        }).pipe(
          map((r) => {
            this.markDone(3, 4);
            return { ...ctx, ...r };
          }),
        );
      }),
      switchMap((ctx) => {
        return forkJoin({
          timeline: this.step5Timeline(ctx.foundation, ctx.suspects),
          events: this.step6EventGraph(
            ctx.foundation,
            ctx.suspects,
            ctx.culpritSuspectId,
            ctx.clues,
            difficulty,
          ),
        }).pipe(
          map((r) => {
            this.markDone(5, 6);
            return { ...ctx, ...r };
          }),
        );
      }),
      switchMap((ctx) => {
        return forkJoin({
          puzzleConcepts: this.step7PuzzleConcepts(ctx.foundation, ctx.clues, ctx.events),
          hintsAndSolution: this.step8HintsAndSolution(
            ctx.foundation,
            ctx.suspects,
            ctx.culpritSuspectId,
            ctx.clues,
            ctx.events,
          ),
        }).pipe(
          map((r) => {
            this.markDone(7, 8);
            return { ...ctx, ...r };
          }),
        );
      }),
      switchMap((ctx) => {
        if (ctx.puzzleConcepts.length === 0) {
          this.markDone(9);
          return of({ ...ctx, puzzles: [] as PuzzleEvent[] });
        }
        return forkJoin(
          ctx.puzzleConcepts.map((concept) =>
            this.step7bPuzzleHtml(concept, ctx.style, ctx.visual.uiTheme),
          ),
        ).pipe(
          map((puzzles) => {
            this.markDone(9);
            return { ...ctx, puzzles };
          }),
        );
      }),
      map((ctx) => {
        const result = this.assemble(ctx as GenCtx);
        this.markDone(10);
        return result;
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Step 1 â€” Case Foundation
  // ---------------------------------------------------------------------------

  private step1Foundation(difficulty: Difficulty, style: string): Observable<CaseFoundation> {
    const guide: Record<Difficulty, string> = {
      easy: '3 suspects. Simple case â€” obvious motive. Culprit identifiable from Act 1 alone.',
      normal: '5 suspects. Moderate complexity â€” layered motive. Culprit clear after Act 2.',
      hard: '5 suspects. Complex â€” obscured motive, misdirection. Culprit only clear in Act 3.',
      genius:
        '5 suspects. Masterwork â€” all suspects plausible, multiple twists, truth requires cross-referencing everything.',
    };

    const suspectCount: Record<Difficulty, number> = {
      easy: 3,
      normal: 5,
      hard: 5,
      genius: 5,
    };

    const seed = Math.floor(Math.random() * 1_000_000);
    const caseTypes = ['murder', 'theft', 'disappearance', 'sabotage', 'other'] as const;
    const caseType = caseTypes[Math.floor(Math.random() * caseTypes.length)];
    const prompt =
      `You are designing a UNIQUE detective mystery for an interactive game called "The Last Alibi".\n` +
      `DIFFICULTY: ${difficulty} \u2014 ${guide[difficulty]}\n` +
      `ART STYLE: ${style}\n` +
      `CREATIVITY SEED: ${seed} \u2014 use this to produce a completely original, unexpected scenario.\n` +
      `CASE TYPE (fixed): ${caseType} \u2014 the crime MUST be a ${caseType}. Build your entire scenario around this.\n\n` +
      `CRITICAL: Invent a wholly ORIGINAL case. Do NOT use "manor house murder", Victorian settings,\n` +
      `jealous sisters, or any other clich\u00e9. The setting, crime type, era, and cast must be fresh.\n\n` +
      `Output ONLY a raw JSON object. No markdown fences, no explanation.\n` +
      `ALL string values below are FORMAT PLACEHOLDERS \u2014 replace every one with original content.\n\n` +
      `{\n` +
      `  "caseSlug": "<your-unique-kebab-slug>",\n` +
      `  "title": "<Your Original Case Title>",\n` +
      `  "subtitle": "<one-line tagline>",\n` +
      `  "caseType": "${caseType}",\n` +
      `  "setting": "<original setting \u2014 era, location, atmosphere>",\n` +
      `  "briefing": "<2-3 sentences the detective reads on arrival>",\n` +
      `  "act1Summary": "<what the player discovers in Act 1>",\n` +
      `  "act2Summary": "<what deepens in Act 2>",\n` +
      `  "act3Summary": "<how truth crystallises in Act 3>",\n` +
      `  "culpritLabel": "<role or description of the guilty party>",\n` +
      `  "motive": "<specific motive>",\n` +
      `  "method": "<specific method>",\n` +
      `  "trueTimeline": "<paragraph: what actually happened step-by-step>",\n` +
      `  "keyContradiction": "<the single fact that exposes the culprit>",\n` +
      `  "redHerringExplanation": "<why the red herring seemed guilty but was not>",\n` +
      `  "suspectLabels": ["<role 1>", "<role 2>", "<more roles>"],\n` +
      `  "lyingSuspectLabels": ["<role>"],\n` +
      `  "mistakenSuspectLabels": ["<role>"],\n` +
      `  "hidingSecretSuspectLabels": ["<role>"]\n` +
      `}\n\n` +
      `Constraints:\n` +
      `- Replace ALL angle-bracket placeholders with real original values\n` +
      `- caseSlug must be kebab-case derived from your title\n` +
      `- culpritLabel must appear verbatim in suspectLabels\n` +
      `- suspectLabels must have exactly ${suspectCount[difficulty]} entries\n` +
      `- lyingSuspectLabels, mistakenSuspectLabels, hidingSecretSuspectLabels are subsets of suspectLabels\n` +
      `- caseType is already set to "${caseType}" \u2014 do not change it`;

    return this.callAndParseJson<CaseFoundation>(prompt, {
      maxTokens: 1800,
      temperature: 0.8,
      debugMeta: {
        label: 'Case Foundation',
        category: 'case-foundation',
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Step 2 â€” Suspects
  // ---------------------------------------------------------------------------

  private step2Suspects(
    f: CaseFoundation,
    style: string,
  ): Observable<{ culpritSuspectId: string; suspects: Suspect[] }> {
    const prompt =
      `Generate all suspects for the detective mystery "${f.title}" (${f.setting}).\n` +
      `The culprit is the suspect matching label "${f.culpritLabel}".\n\n` +
      `Suspect labels: ${f.suspectLabels.map((l, i) => `${i + 1}. "${l}"`).join('; ')}\n` +
      `lyingSuspectLabels: ${JSON.stringify(f.lyingSuspectLabels)}\n` +
      `mistakenSuspectLabels: ${JSON.stringify(f.mistakenSuspectLabels)}\n` +
      `hidingSecretSuspectLabels: ${JSON.stringify(f.hidingSecretSuspectLabels)}\n\n` +
      `Output ONLY raw JSON. No markdown fences.\n\n` +
      `{\n` +
      `  "culpritSuspectId": "suspect-<kebab-name-of-culprit>",\n` +
      `  "suspects": [\n` +
      `    {\n` +
      `      "id": "suspect-<kebab-case>",\n` +
      `      "name": "Full Name",\n` +
      `      "age": 35,\n` +
      `      "occupation": "job title",\n` +
      `      "relationship": "relationship to victim",\n` +
      `      "description": "physical appearance and first impression",\n` +
      `      "personality": "key character traits",\n` +
      `      "alibi": "what they claim they were doing at time of crime",\n` +
      `      "secretUnrelatedToCase": "embarrassing personal secret unrelated to the crime",\n` +
      `      "isLying": false,\n` +
      `      "isMistaken": false,\n` +
      `      "isHidingSecret": false,\n` +
      `      "interviewDialogue": [\n` +
      `        { "speakerId": "suspect-id", "speakerName": "Name", "text": "interview line", "revealsTruth": false },\n` +
      `        { "speakerId": "suspect-id", "speakerName": "Name", "text": "interview line", "revealsTruth": true },\n` +
      `        { "speakerId": "suspect-id", "speakerName": "Name", "text": "interview line", "revealsTruth": false },\n` +
      `        { "speakerId": "suspect-id", "speakerName": "Name", "text": "interview line", "revealsTruth": false }\n` +
      `      ],\n` +
      `      "imagePrompt": "${style}, portrait of [name], [occupation], dramatic lighting"\n` +
      `    }\n` +
      `  ]\n` +
      `}\n\n` +
      `Rules:\n` +
      `- The suspect matching culpritLabel MUST have isLying: true\n` +
      `- Suspects with matching lyingSuspectLabels also have isLying: true\n` +
      `- Suspects with matching mistakenSuspectLabels have isMistaken: true\n` +
      `- Suspects with matching hidingSecretSuspectLabels have isHidingSecret: true\n` +
      `- Each suspect has exactly 4 interviewDialogue entries\n` +
      `- speakerId in each dialogue entry must match that suspect's id`;

    return this.callAndParseJson<{ culpritSuspectId: string; suspects: Suspect[] }>(prompt, {
      maxTokens: 3200,
      temperature: 0.8,
      debugMeta: {
        label: 'Suspects',
        category: 'suspects',
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Step 3 â€” Locations
  // ---------------------------------------------------------------------------

  private step3Locations(f: CaseFoundation): Observable<LocationSpec[]> {
    const prompt =
      `Generate exactly 5 locations for the detective mystery "${f.title}" (${f.setting}).\n` +
      `Do NOT include a "cluesFoundHere" field.\n\n` +
      `Output ONLY raw JSON. No markdown fences.\n\n` +
      `{\n` +
      `  "locations": [\n` +
      `    {\n` +
      `      "id": "location-<kebab-case>",\n` +
      `      "name": "location name",\n` +
      `      "description": "what the detective observes here",\n` +
      `      "atmosphere": "sensory details â€” smell, light, sound",\n` +
      `      "imagePrompt": "scene prompt for this location"\n` +
      `    }\n` +
      `  ]\n` +
      `}\n\n` +
      `Generate exactly 5 locations specific to ${f.setting}.`;

    return this.callAndParseJson<{ locations: LocationSpec[] }>(prompt, {
      maxTokens: 1600,
      temperature: 0.7,
      debugMeta: {
        label: 'Locations',
        category: 'locations',
      },
    }).pipe(map((r) => r.locations));
  }

  // ---------------------------------------------------------------------------
  // Step 4 â€” Clues
  // ---------------------------------------------------------------------------

  private step4Clues(
    f: CaseFoundation,
    culpritSuspectId: string,
    suspects: Suspect[],
    locations: LocationSpec[],
  ): Observable<CluesResult> {
    const culpritName = suspects.find((s) => s.id === culpritSuspectId)?.name ?? 'the culprit';
    const locationIds = locations.map((l) => l.id).join(', ');
    const clueCount = f.suspectLabels.length <= 3 ? 6 : f.suspectLabels.length <= 4 ? 9 : 10;

    const prompt =
      `Generate exactly ${clueCount} clues for the detective mystery "${f.title}".\n` +
      `Setting: ${f.setting}\n` +
      `Culprit: ${culpritName} â€” method: ${f.method}\n` +
      `Key contradiction: ${f.keyContradiction}\n\n` +
      `Available location IDs (use exactly these as locationId values):\n` +
      `${locationIds}\n\n` +
      `Output ONLY raw JSON. No markdown fences.\n\n` +
      `{\n` +
      `  "clues": [\n` +
      `    {\n` +
      `      "id": "clue-<kebab-case>",\n` +
      `      "name": "short evidence name",\n` +
      `      "description": "one sentence of what the detective observes",\n` +
      `      "locationId": "<must be from the list above>",\n` +
      `      "isRedHerring": false,\n` +
      `      "revealsInfo": "what this clue logically tells the detective",\n` +
      `      "imagePrompt": "still life prompt"\n` +
      `    }\n` +
      `  ],\n` +
      `  "culpritClueIds": ["<2-3 clue ids that form the chain of evidence proving guilt>"],\n` +
      `  "redHerringClueIds": ["<ids of clues with isRedHerring: true>"],\n` +
      `  "importantClueId": "<the single most damning clue â€” must be in culpritClueIds>"\n` +
      `}\n\n` +
      `Rules:\n` +
      `- At least 2 clues must have isRedHerring: true (and be listed in redHerringClueIds)\n` +
      `- culpritClueIds must NOT overlap with redHerringClueIds\n` +
      `- importantClueId must be in culpritClueIds\n` +
      `- All locationId values must be from the list above`;

    return this.callAndParseJson<CluesResult>(prompt, {
      maxTokens: 2400,
      temperature: 0.75,
      debugMeta: {
        label: 'Clues & Evidence',
        category: 'clues',
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Step 5 â€” Timeline
  // ---------------------------------------------------------------------------

  private step5Timeline(f: CaseFoundation, suspects: Suspect[]): Observable<TimelineEvent[]> {
    const suspectIds = suspects.map((s) => s.id).join(', ');

    const prompt =
      `Generate exactly 10 timeline entries for the mystery "${f.title}".\n` +
      `Setting: ${f.setting}\n` +
      `True events: ${f.trueTimeline}\n\n` +
      `Available suspect IDs: ${suspectIds}\n\n` +
      `Output ONLY raw JSON. No markdown fences.\n\n` +
      `{\n` +
      `  "timeline": [\n` +
      `    {\n` +
      `      "id": "timeline-<kebab-case>",\n` +
      `      "time": "7:30 PM",\n` +
      `      "description": "one sentence about this event",\n` +
      `      "involvedSuspectIds": [],\n` +
      `      "isTrue": true\n` +
      `    }\n` +
      `  ]\n` +
      `}\n\n` +
      `Rules:\n` +
      `- Exactly 10 entries\n` +
      `- At least 6 isTrue: true, at least 2 isTrue: false (false = rumour or misdirection)\n` +
      `- The actual moment of the crime MUST appear as isTrue: true\n` +
      `- Use only the suspect IDs listed above in involvedSuspectIds`;

    return this.callAndParseJson<{ timeline: TimelineEvent[] }>(prompt, {
      maxTokens: 1800,
      temperature: 0.7,
      debugMeta: {
        label: 'Timeline',
        category: 'timeline',
      },
    }).pipe(map((r) => r.timeline));
  }

  // ---------------------------------------------------------------------------
  // Step 6 â€” Event Graph
  // ---------------------------------------------------------------------------

  private step6EventGraph(
    f: CaseFoundation,
    suspects: Suspect[],
    culpritSuspectId: string,
    clues: CluesResult,
    difficulty: Difficulty,
  ): Observable<EventSpec[]> {
    const suspectIds = suspects.map((s) => s.id).join(', ');
    const clueIds = clues.clues.map((c) => c.id).join(', ');
    const puzzleCount: Record<Difficulty, number> = {
      easy: 1,
      normal: 2,
      hard: 2,
      genius: 3,
    };

    const prompt =
      `Generate the investigation event graph for "${f.title}".\n` +
      `Setting: ${f.setting}\n` +
      `Act 1: ${f.act1Summary}\n` +
      `Act 2: ${f.act2Summary}\n` +
      `Act 3: ${f.act3Summary}\n` +
      `Culprit suspect ID: ${culpritSuspectId}\n` +
      `Key clues proving guilt: ${clues.culpritClueIds.join(', ')}\n\n` +
      `Available suspect IDs: ${suspectIds}\n` +
      `Available clue IDs: ${clueIds}\n\n` +
      `Output ONLY raw JSON. No markdown fences.\n\n` +
      `{\n` +
      `  "events": [\n` +
      `    {\n` +
      `      "id": "event-<kebab-case>",\n` +
      `      "category": "investigation",\n` +
      `      "type": "searchRoom",\n` +
      `      "title": "player-facing title",\n` +
      `      "description": "one sentence teaser",\n` +
      `      "act": 1,\n` +
      `      "isMandatory": true,\n` +
      `      "unlockConditions": [],\n` +
      `      "rewardsClueIds": [],\n` +
      `      "unlocksSuspectIds": [],\n` +
      `      "puzzleLabel": null,\n` +
      `      "dialogueSuspectId": null,\n` +
      `      "narration": "2-3 sentence scene description"\n` +
      `    }\n` +
      `  ]\n` +
      `}\n\n` +
      `Rules:\n` +
      `- Generate 6-9 events spread across acts 1, 2, and 3\n` +
      `- Act 1 must have at least 2 events with unlockConditions: []\n` +
      `- category: "investigation"|"social"|"surprise"|"puzzle"|"deduction"\n` +
      `- Social events must have dialogueSuspectId set to a valid suspect id\n` +
      `- Generate exactly ${puzzleCount[difficulty]} event(s) with category "puzzle"; these must have puzzleLabel set to a short kebab-case label (e.g. "desk-cipher"), NOT null\n` +
      `- All rewardsClueIds must be from the clue IDs list\n` +
      `- All dialogueSuspectId and unlocksSuspectIds values must be from the suspect IDs list\n` +
      `- unlockConditions referenceId must exist in the clue IDs, suspect IDs, or other event IDs in this array\n` +
      `- Do NOT create circular unlock conditions\n` +
      `- Key culprit clues (${clues.culpritClueIds.join(', ')}) should be rewards in Act 2-3 events`;

    return this.callAndParseJson<{ events: EventSpec[] }>(prompt, {
      maxTokens: 3200,
      temperature: 0.75,
      debugMeta: {
        label: 'Investigation Events',
        category: 'event-graph',
      },
    }).pipe(map((r) => r.events));
  }

  // ---------------------------------------------------------------------------
  // Step 7 — Puzzle Concepts (no HTML)
  // ---------------------------------------------------------------------------

  private step7PuzzleConcepts(
    f: CaseFoundation,
    clues: CluesResult,
    events: EventSpec[],
  ): Observable<PuzzleConcept[]> {
    const puzzleLabels = events.filter((e) => e.puzzleLabel).map((e) => e.puzzleLabel!);
    if (puzzleLabels.length === 0) return of([]);

    return forkJoin(puzzleLabels.map((label) => this.step7PuzzleConcept(f, clues, label)));
  }

  private step7PuzzleConcept(
    f: CaseFoundation,
    clues: CluesResult,
    label: string,
  ): Observable<PuzzleConcept> {
    const availableClueIds = clues.clues.map((c) => c.id).join(', ');
    const puzzleId = `puzzle-${label}`;

    const prompt =
      `Generate a single puzzle concept for the detective mystery "${f.title}" (${f.setting}).\n` +
      `Puzzle label: ${label}\n` +
      `Required puzzle id: ${puzzleId}\n\n` +
      `Available clue IDs for rewards: ${availableClueIds}\n\n` +
      `Your goal in this step is to ensure this puzzle has real logic, embedded clues, and a clearly intended solution before any HTML is written.\n` +
      `Output ONLY raw JSON. No markdown fences.\n\n` +
      `{\n` +
      `  "label": "${label}",\n` +
      `  "id": "${puzzleId}",\n` +
      `  "rewardedClueId": "<clue id from the available list above>",\n` +
      `  "puzzleTitle": "The Brass Box Cipher",\n` +
      `  "puzzleType": "cipher",\n` +
      `  "puzzleDescription": "what the player sees and can interact with, 1-2 sentences",\n` +
      `  "puzzleLogic": "the internal reasoning structure and how the clues lead to the answer",\n` +
      `  "clues": ["explicit clue the player can inspect", "second clue that supports the logic", "optional third clue"],\n` +
      `  "solution": "the exact intended answer or final state the player must reach",\n` +
      `  "validationLogic": "the exact rule the HTML implementation should use to decide the puzzle is solved",\n` +
      `  "uiConcept": "a short description of the interface layout and interaction style",\n` +
      `  "hints": ["vague hint", "more specific", "points toward solution", "nearly explicit"]\n` +
      `}\n\n` +
      `Rules:\n` +
      `- label must be exactly ${label}\n` +
      `- id must be exactly ${puzzleId}\n` +
      `- puzzleType: "cipher"|"lock"|"pattern"|"fragment"|"logic_grid"|"sequence"|"map"|"mechanical"\n` +
      `- rewardedClueId must be from the available clue IDs\n` +
      `- clues must contain 2-5 concrete puzzle clues the player can reason from\n` +
      `- puzzleLogic must describe how the puzzle actually works, not just its theme\n` +
      `- solution must be explicit and fully solvable from the clues in the concept\n` +
      `- validationLogic must clearly define what exact player action or answer counts as solved\n` +
      `- uiConcept must describe a simple HTML-friendly interface\n` +
      `- hints must contain 3-5 entries\n` +
      `- Choose a puzzle type that fits the ${f.setting} setting`;

    return this.callAndParseJson<PuzzleConcept>(prompt, {
      maxTokens: 1200,
      temperature: 0.65,
      debugMeta: {
        label: `Puzzle Concept: ${label}`,
        category: 'puzzle-concept',
        puzzleId,
        puzzleLabel: label,
      },
    }).pipe(
      map((concept) => ({
        ...concept,
        label,
        id: puzzleId,
      })),
    );
  }

  // ---------------------------------------------------------------------------
  // Step 7b — Puzzle HTML (one call per concept)
  // ---------------------------------------------------------------------------

  private step7bPuzzleHtml(
    concept: PuzzleConcept,
    style: string,
    theme: UITheme,
  ): Observable<PuzzleEvent> {
    const prompt =
      `Create a self-contained HTML puzzle for a detective mystery game based on this validated puzzle concept.\n\n` +
      `Puzzle title: ${concept.puzzleTitle}\n` +
      `Type: ${concept.puzzleType}\n` +
      `What the player sees: ${concept.puzzleDescription}\n` +
      `Puzzle logic: ${concept.puzzleLogic}\n` +
      `Embedded clues: ${concept.clues.join(' | ')}\n` +
      `Intended solution: ${concept.solution}\n` +
      `Validation logic: ${concept.validationLogic}\n` +
      `UI concept: ${concept.uiConcept}\n` +
      `Puzzle ID: ${concept.id}\n\n` +
      `Requirements:\n` +
      `- Complete valid HTML document starting with <!DOCTYPE html>\n` +
      `- ALL CSS and JS inline (no external files, no CDN links)\n` +
      `- Use these exact theme colors from the game: page background ${theme.primaryColor}, panel/card background ${theme.secondaryColor}, accent/highlight color ${theme.accentColor}, surface color ${theme.surfaceColor}, body text ${theme.textColor}\n` +
      `- Atmosphere matches: ${style}\n` +
      `- MUST implement the exact puzzle logic, clues, and validation rules from the concept above\n` +
      `- MUST call: window.parent.postMessage({type:"PUZZLE_SOLVED",puzzleId:"${concept.id}"},"*") exactly once when solved\n` +
      `- Must be solvable without outside knowledge and without inventing extra hidden rules\n` +
      `- No localStorage, sessionStorage, or cookies\n` +
      `- No alert() or confirm()\n` +
      `- Show a clear visual success state when solved\n` +
      `- ABSOLUTELY NO <img> tags, no <image> tags, no base64 data URIs, no SVG images — text and CSS only\n` +
      `- Do NOT embed any binary data or base64 encoded content of any kind\n` +
      `- Keep the HTML under 200 lines total\n\n` +
      `Output ONLY the raw HTML. No JSON wrapper, no markdown fences, no explanation.`;

    return this.callPuzzle(prompt, {
      debugMeta: {
        label: `Puzzle HTML: ${concept.label}`,
        category: 'puzzle-html',
        puzzleId: concept.id,
        puzzleLabel: concept.label,
      },
    }).pipe(
      map((raw) => this.stripHtmlFences(raw)),
      map(
        (html): PuzzleEvent => ({
          id: concept.id,
          type: concept.puzzleType,
          title: concept.puzzleTitle,
          description: concept.puzzleDescription,
          htmlComponent: html,
          solutionCondition: concept.solution,
          rewardedClueId: concept.rewardedClueId,
          hints: concept.hints,
        }),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Step 8 â€” Hint Ladder + Solution Explanation
  // ---------------------------------------------------------------------------

  private step8HintsAndSolution(
    f: CaseFoundation,
    suspects: Suspect[],
    culpritSuspectId: string,
    clues: CluesResult,
    events: EventSpec[],
  ): Observable<HintResult> {
    const culpritName = suspects.find((s) => s.id === culpritSuspectId)?.name ?? 'the culprit';
    const eventIds = events.map((e) => e.id).join(', ');
    const redHerringCount = clues.redHerringClueIds.length;

    const prompt =
      `Generate the hint ladder and solution explanation for "${f.title}".\n` +
      `Culprit: ${culpritName} â€” motive: ${f.motive}\n` +
      `Method: ${f.method}\n` +
      `Key contradiction: ${f.keyContradiction}\n` +
      `Truth: ${f.trueTimeline}\n\n` +
      `Available event IDs (for targetsEventId): ${eventIds}\n\n` +
      `Output ONLY raw JSON. No markdown fences.\n\n` +
      `{\n` +
      `  "hintLadder": [\n` +
      `    { "index": 0, "text": "very vague â€” do not name suspects or evidence", "targetsEventId": null },\n` +
      `    { "index": 1, "text": "slightly more specific", "targetsEventId": null },\n` +
      `    { "index": 2, "text": "points toward a general area of investigation", "targetsEventId": null },\n` +
      `    { "index": 3, "text": "narrows down the method or motive", "targetsEventId": null },\n` +
      `    { "index": 4, "text": "nearly explicit â€” almost names the culprit", "targetsEventId": null }\n` +
      `  ],\n` +
      `  "solutionExplanation": {\n` +
      `    "narrative": "3-5 sentence prose of the full truth, written like the end of a detective novel",\n` +
      `    "stepsExplained": [\n` +
      `      "the inciting event",\n` +
      `      "how the culprit planned or acted",\n` +
      `      "how they tried to cover it up",\n` +
      `      "the key contradiction that exposes them",\n` +
      `      "the final conclusion"\n` +
      `    ],\n` +
      `    "redHerringExplanations": [${Array(redHerringCount).fill('"explanation sentence"').join(', ')}]\n` +
      `  }\n` +
      `}\n\n` +
      `if targetsEventId is set, it must be one of: ${eventIds}`;

    return this.callAndParseJson<HintResult>(prompt, {
      maxTokens: 2200,
      temperature: 0.7,
      debugMeta: {
        label: 'Hint Ladder',
        category: 'hint-ladder',
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Step 9 â€” Visual Direction + UI Theme + Image Templates
  // ---------------------------------------------------------------------------

  private step9Visual(
    f: CaseFoundation,
    _suspects: Suspect[],
    style: string,
  ): Observable<VisualResult> {
    const prompt =
      `You are generating a visual theme and UI color scheme for the detective mystery "${f.title}".\n` +
      `Style: "${style}" | Setting: ${f.setting} | Case type: ${f.caseType}\n\n` +
      `STEP 1 — DECIDE THEME BRIGHTNESS\n` +
      `Based on "${style}", decide if the UI should be DARK (dark backgrounds, light text) or\n` +
      `LIGHT (light/pale backgrounds, dark text). Write your decision before the JSON as a comment, then follow it.\n\n` +
      `STEP 2 — PICK COLORS THAT MATCH YOUR DECISION\n` +
      `For DARK themes: primaryColor luminance ≤ 0.15, textColor luminance ≥ 0.60\n` +
      `For LIGHT themes: primaryColor luminance ≥ 0.60, textColor luminance ≤ 0.20\n` +
      `Luminance of #rrggbb = 0.2126*(r/255)^2.2 + 0.7152*(g/255)^2.2 + 0.0722*(b/255)^2.2 (simplified sRGB)\n\n` +
      `STEP 3 — VERIFY CONTRAST BEFORE OUTPUTTING\n` +
      `Verify ALL of these pairs pass WCAG AA (contrast ratio ≥ 4.5:1):\n` +
      `  A) textColor on primaryColor  (body text on page background)\n` +
      `  B) textColor on secondaryColor (body text on card/panel backgrounds)\n` +
      `  C) textColor on surfaceColor  (body text on elevated surfaces)\n` +
      `  D) accentColor on primaryColor (headings/labels on page background)\n` +
      `  E) accentColor on secondaryColor (headings on cards)\n` +
      `Contrast ratio = (L1+0.05)/(L2+0.05) where L1 is the lighter luminance.\n` +
      `If any pair fails, adjust until all five pass.\n\n` +
      `Output ONLY raw JSON. No markdown fences. No comments inside the JSON.\n` +
      `Replace every placeholder in angle brackets with a real value.\n\n` +
      `{\n` +
      `  "visualDirection": {\n` +
      `    "artStyle": "<short description of the visual style>",\n` +
      `    "mood": "<emotional mood>",\n` +
      `    "colorPalette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],\n` +
      `    "lightingStyle": "<describe lighting>",\n` +
      `    "renderingStyle": "<describe rendering approach>",\n` +
      `    "globalStylePrompt": "<compact Imagen style prefix for all images>",\n` +
      `    "negativePrompt": "<things to avoid in all images>"\n` +
      `  },\n` +
      `  "uiTheme": {\n` +
      `    "primaryColor": "<#rrggbb — page background>",\n` +
      `    "secondaryColor": "<#rrggbb — panel/card background, same dark/light direction as primary>",\n` +
      `    "accentColor": "<#rrggbb — heading/highlight color, ≥4.5:1 on both primary and secondary>",\n` +
      `    "surfaceColor": "<#rrggbb — elevated surface, same dark/light direction as primary>",\n` +
      `    "textColor": "<#rrggbb — body text, ≥4.5:1 on primary, secondary, AND surface>",\n` +
      `    "panelStyle": "<flat|raised|inset>",\n` +
      `    "borderStyle": "<e.g. 1px solid rgba(r,g,b,0.35)>",\n` +
      `    "shadowStyle": "<e.g. 0 4px 24px rgba(0,0,0,0.5)>",\n` +
      `    "textureFamily": "<paper|grain|cork|metal|leather|fabric|pixel_noise>"\n` +
      `  },\n` +
      `  "imagePromptTemplates": {\n` +
      `    "suspectPortrait": "${style}, portrait of {name}, {occupation}, {description}, dramatic lighting",\n` +
      `    "locationScene": "${style}, {name}, {atmosphere}, cinematic",\n` +
      `    "clueObject": "${style}, still life, {name}, {description}, moody",\n` +
      `    "eventSplash": "${style}, detective scene, atmospheric",\n` +
      `    "puzzleObject": "${style}, antique object, intricate detail"\n` +
      `  }\n` +
      `}\n\n` +
      `Hard rules (violations will break the game UI):\n` +
      `- All hex colors: exactly #rrggbb format, no comments or extra text\n` +
      `- colorPalette: 4-6 entries\n` +
      `- textureFamily: exactly one of paper|grain|cork|metal|leather|fabric|pixel_noise\n` +
      `- panelStyle: exactly one of flat|raised|inset\n` +
      `- secondary and surface must be in the same dark/light direction as primary (all dark OR all light)\n` +
      `- textColor contrast ≥4.5:1 against primary, secondary, AND surface — if unsure, use near-white (#f0ece0) for dark themes or near-black (#1a1a1a) for light themes\n` +
      `- accentColor contrast ≥4.5:1 against primary and secondary — accent can be saturated/colorful but must still be readable as text\n` +
      `- Do NOT make accent and text the same color\n` +
      `- The palette must evoke "${style}" — avoid defaulting to generic dark navy/gold unless it specifically fits`;

    return this.callAndParseJson<VisualResult>(prompt, {
      maxTokens: 2200,
      temperature: 0.75,
      debugMeta: {
        label: 'Visual Theme',
        category: 'visual-theme',
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Assembly â€” combine all step outputs into a CasePackage
  // ---------------------------------------------------------------------------

  private assemble(ctx: GenCtx): CasePackage {
    // Resolve puzzleLabel â†’ puzzleId for event graph
    const labelToId = new Map(ctx.puzzleConcepts.map((concept) => [concept.label, concept.id]));

    const eventGraph: InvestigationEvent[] = ctx.events.map((e) => ({
      id: e.id,
      category: e.category,
      type: e.type,
      title: e.title,
      description: e.description,
      act: e.act,
      isMandatory: e.isMandatory,
      unlockConditions: e.unlockConditions,
      rewardsClueIds: e.rewardsClueIds,
      unlocksSuspectIds: e.unlocksSuspectIds,
      puzzleId: e.puzzleLabel ? (labelToId.get(e.puzzleLabel) ?? undefined) : undefined,
      dialogueSuspectId: e.dialogueSuspectId ?? undefined,
      narration: e.narration,
    }));

    // Derive cluesFoundHere for each location (invert clue.locationId)
    const cluesByLocation = new Map<string, string[]>();
    for (const clue of ctx.clues.clues) {
      const arr = cluesByLocation.get(clue.locationId) ?? [];
      arr.push(clue.id);
      cluesByLocation.set(clue.locationId, arr);
    }

    const locations: Location[] = ctx.locations.map((l) => ({
      ...l,
      cluesFoundHere: cluesByLocation.get(l.id) ?? [],
    }));

    const truth: TruthLayer = {
      culpritId: ctx.culpritSuspectId,
      motive: ctx.foundation.motive,
      method: ctx.foundation.method,
      trueTimeline: ctx.foundation.trueTimeline,
      keyContradiction: ctx.foundation.keyContradiction,
      importantClueId: ctx.clues.importantClueId,
      redHerringExplanation: ctx.foundation.redHerringExplanation,
      lyingSuspectIds: ctx.suspects.filter((s) => s.isLying).map((s) => s.id),
      mistakenSuspectIds: ctx.suspects.filter((s) => s.isMistaken).map((s) => s.id),
      hidingSecretSuspectIds: ctx.suspects.filter((s) => s.isHidingSecret).map((s) => s.id),
      revealingClueIds: ctx.clues.culpritClueIds,
      redHerringClueIds: ctx.clues.redHerringClueIds,
    };

    return {
      id: `case-${ctx.foundation.caseSlug}`,
      generatedAt: new Date().toISOString(),
      metadata: {
        title: ctx.foundation.title,
        subtitle: ctx.foundation.subtitle,
        caseType: ctx.foundation.caseType,
        difficulty: ctx.difficulty,
        setting: ctx.foundation.setting,
        briefing: ctx.foundation.briefing,
        act1Summary: ctx.foundation.act1Summary,
        act2Summary: ctx.foundation.act2Summary,
        act3Summary: ctx.foundation.act3Summary,
      },
      truth,
      suspects: ctx.suspects,
      locations,
      clues: ctx.clues.clues,
      timeline: ctx.timeline,
      eventGraph,
      puzzles: ctx.puzzles,
      hintLadder: ctx.hintsAndSolution.hintLadder,
      solutionExplanation: ctx.hintsAndSolution.solutionExplanation,
      visualDirection: ctx.visual.visualDirection,
      uiTheme: ctx.visual.uiTheme,
      imagePromptTemplates: ctx.visual.imagePromptTemplates,
    };
  }

  // ---------------------------------------------------------------------------
  // Worker transport wrappers
  // ---------------------------------------------------------------------------

  private callText(prompt: string, options: LlmCallOptions = {}, attempt = 0): Observable<string> {
    return this.workerLlm.generateText({ prompt, ...options }).pipe(
      catchError((err: Error) => {
        if (attempt < 2) return this.callText(prompt, options, attempt + 1);
        return throwError(
          () => new Error(`LLM text call failed after ${attempt + 1} attempts: ${err.message}`),
        );
      }),
    );
  }

  private callPuzzle(
    prompt: string,
    options: LlmCallOptions = {},
    attempt = 0,
  ): Observable<string> {
    return this.workerLlm.generatePuzzle({ prompt, ...options }).pipe(
      catchError((err: Error) => {
        if (attempt < 2) return this.callPuzzle(prompt, options, attempt + 1);
        return throwError(
          () => new Error(`LLM puzzle call failed after ${attempt + 1} attempts: ${err.message}`),
        );
      }),
    );
  }

  /** Calls the text model and parses JSON, retrying up to 2 times on invalid-JSON responses. */
  private callAndParseJson<T>(
    prompt: string,
    options: LlmCallOptions = {},
    jsonAttempt = 0,
  ): Observable<T> {
    return this.callText(prompt, options).pipe(
      map((raw) => this.parseJson<T>(raw)),
      catchError((err: Error) => {
        if (err.message.startsWith('LLM response is not valid JSON') && jsonAttempt < 2) {
          return this.callAndParseJson<T>(prompt, options, jsonAttempt + 1);
        }
        return throwError(() => err);
      }),
    );
  }

  /** Rewrites an image prompt into a safer form before it is sent to the image worker. */
  createSafeImagePrompt(
    originalPrompt: string,
    debugMeta: DebugRequestMeta = {
      label: 'Image Safe Prompt Rewrite',
      category: 'image-safe-prompt',
    },
  ): Observable<string> {
    const prompt =
      `Rewrite this image-generation prompt into a safer production prompt before it is sent to the image worker.\n` +
      `ORIGINAL PROMPT: "${originalPrompt}"\n\n` +
      `Preserve the same scene, composition, atmosphere, visual style, and subject intent while making it less likely to trigger content filters.\n` +
      `- Replace specific character names with generic descriptors (e.g. "a middle-aged man" not "Victor LeBlanc")\n` +
      `- Remove all proper nouns entirely, including first names, surnames, city names, venue names, and unique location names\n` +
      `- Replace identifiable person names, branded references, and overly specific personal details with neutral descriptive terms\n` +
      `- The final prompt must contain zero proper nouns and zero quoted names\n` +
      `- Avoid wording that implies real-world violence, harm, or explicit content\n` +
      `- Prefer detective-fiction phrasing like "tense scene", "mysterious evidence", or "dramatic portrait" over explicit criminal acts\n` +
      `- Keep the same art style prefix, mood, atmosphere, and compositional intent intact\n` +
      `- Keep the prompt concise and image-model friendly\n` +
      `- If any specific name or unique place remains, rewrite it again into a generic description before answering\n` +
      `- Output ONLY the rewritten prompt text — no explanation, no quotes, no extra text`;
    return this.callText(prompt, {
      maxTokens: 500,
      temperature: 0.1,
      debugMeta,
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private parseJson<T>(raw: string): T {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // Fallback: extract the first JSON object from the response
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]) as T;
        } catch {
          /* fall through */
        }
      }
      throw new Error(`LLM response is not valid JSON: ${cleaned.substring(0, 300)}`);
    }
  }

  private stripHtmlFences(raw: string): string {
    // 1. Extract HTML from a fenced code block anywhere in the string (```html ... ```)
    const fenceMatch = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
    if (fenceMatch) return fenceMatch[1].trim();

    // 2. Find where the HTML document starts, discarding any LLM preamble
    const doctypeIdx = raw.indexOf('<!DOCTYPE');
    if (doctypeIdx >= 0) return raw.slice(doctypeIdx).trim();

    const htmlTagIdx = raw.search(/<html[\s>]/i);
    if (htmlTagIdx >= 0) return raw.slice(htmlTagIdx).trim();

    // 3. Fallback — return trimmed raw text as-is
    return raw.trim();
  }
}
