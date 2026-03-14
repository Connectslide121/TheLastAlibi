import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { environment } from '../../environments/environment';
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

interface PuzzleSpec {
  label: string;
  id: string;
  type: PuzzleEvent['type'];
  title: string;
  description: string;
  solutionCondition: string;
  rewardedClueId: string;
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
  puzzleSpecs: PuzzleSpec[];
  hintsAndSolution: HintResult;
  puzzles: PuzzleEvent[];
}

export interface GenerationStepStatus {
  label: string;
  detail: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

const STEP_DEFS: Omit<GenerationStepStatus, 'status'>[] = [
  { label: 'Case Foundation', detail: 'Setting, premise, culprit & motive' },
  { label: 'Suspects', detail: 'Character profiles & interview dialogue' },
  { label: 'Locations', detail: 'Crime scene & surrounding areas' },
  { label: 'Clues & Evidence', detail: 'Physical evidence and red herrings' },
  { label: 'Visual Theme', detail: 'Colour palette, art style & UI skin' },
  { label: 'Timeline', detail: '10-entry chronological event log' },
  { label: 'Investigation Events', detail: 'Interactive event graph across 3 acts' },
  { label: 'Puzzle Specs', detail: 'Puzzle designs & solution conditions' },
  { label: 'Hint Ladder', detail: 'Progressive hints & solution narrative' },
  { label: 'Puzzle Components', detail: 'Self-contained interactive HTML puzzles' },
  { label: 'Final Assembly', detail: 'Stitching all pieces into the case file' },
];

function makeSteps(): GenerationStepStatus[] {
  return STEP_DEFS.map((s, i) => ({ ...s, status: i === 0 ? 'active' : 'pending' }));
}

@Injectable({ providedIn: 'root' })
export class LlmService {
  private readonly http = inject(HttpClient);

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
          puzzleSpecs: this.step7PuzzleSpecs(ctx.foundation, ctx.clues, ctx.events),
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
        if (ctx.puzzleSpecs.length === 0) {
          this.markDone(9);
          return of({ ...ctx, puzzles: [] as PuzzleEvent[] });
        }
        return forkJoin(ctx.puzzleSpecs.map((spec) => this.step7bPuzzleHtml(spec, ctx.style))).pipe(
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

    const prompt =
      `You are designing a detective mystery for an interactive game called "The Last Alibi".\n` +
      `DIFFICULTY: ${difficulty} â€” ${guide[difficulty]}\n` +
      `ART STYLE: ${style}\n\n` +
      `Output ONLY a raw JSON object. No markdown fences, no explanation.\n\n` +
      `{\n` +
      `  "caseSlug": "the-manor-house-murder",\n` +
      `  "title": "The Manor House Murder",\n` +
      `  "subtitle": "one-line tagline",\n` +
      `  "caseType": "murder",\n` +
      `  "setting": "1930s English country manor",\n` +
      `  "briefing": "2-3 sentences the detective reads on arrival",\n` +
      `  "act1Summary": "what the player discovers in Act 1",\n` +
      `  "act2Summary": "what deepens in Act 2",\n` +
      `  "act3Summary": "how truth crystallises in Act 3",\n` +
      `  "culpritLabel": "the jealous younger sister",\n` +
      `  "motive": "specific motive",\n` +
      `  "method": "specific method e.g. arsenic in the brandy",\n` +
      `  "trueTimeline": "paragraph: what actually happened step-by-step",\n` +
      `  "keyContradiction": "the single fact that exposes the culprit",\n` +
      `  "redHerringExplanation": "why the red herring seemed guilty but was not",\n` +
      `  "suspectLabels": ["the jealous younger sister", "the business partner", "..."],\n` +
      `  "lyingSuspectLabels": ["the jealous younger sister"],\n` +
      `  "mistakenSuspectLabels": ["the wronged servant"],\n` +
      `  "hidingSecretSuspectLabels": ["the family lawyer"]\n` +
      `}\n\n` +
      `Constraints:\n` +
      `- caseSlug must be kebab-case\n` +
      `- culpritLabel must appear in suspectLabels\n` +
      `- suspectLabels must have exactly ${suspectCount[difficulty]} entries\n` +
      `- lyingSuspectLabels, mistakenSuspectLabels, hidingSecretSuspectLabels are subsets of suspectLabels\n` +
      `- caseType: "murder"|"theft"|"disappearance"|"sabotage"|"other"`;

    return this.callLlm(prompt).pipe(map((raw) => this.parseJson<CaseFoundation>(raw)));
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

    return this.callLlm(prompt).pipe(
      map((raw) => this.parseJson<{ culpritSuspectId: string; suspects: Suspect[] }>(raw)),
    );
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

    return this.callLlm(prompt).pipe(
      map((raw) => this.parseJson<{ locations: LocationSpec[] }>(raw).locations),
    );
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

    return this.callLlm(prompt).pipe(map((raw) => this.parseJson<CluesResult>(raw)));
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

    return this.callLlm(prompt).pipe(
      map((raw) => this.parseJson<{ timeline: TimelineEvent[] }>(raw).timeline),
    );
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

    return this.callLlm(prompt).pipe(
      map((raw) => this.parseJson<{ events: EventSpec[] }>(raw).events),
    );
  }

  // ---------------------------------------------------------------------------
  // Step 7 â€” Puzzle Specs (no HTML)
  // ---------------------------------------------------------------------------

  private step7PuzzleSpecs(
    f: CaseFoundation,
    clues: CluesResult,
    events: EventSpec[],
  ): Observable<PuzzleSpec[]> {
    const puzzleLabels = events.filter((e) => e.puzzleLabel).map((e) => e.puzzleLabel!);
    if (puzzleLabels.length === 0) return of([]);

    const availableClueIds = clues.clues.map((c) => c.id).join(', ');

    const prompt =
      `Generate puzzle specifications for the detective mystery "${f.title}" (${f.setting}).\n` +
      `Puzzle labels to generate (one spec per label): ${puzzleLabels.join(', ')}\n\n` +
      `Available clue IDs for rewards: ${availableClueIds}\n\n` +
      `Output ONLY raw JSON. No markdown fences.\n\n` +
      `{\n` +
      `  "puzzleSpecs": [\n` +
      `    {\n` +
      `      "label": "desk-cipher",\n` +
      `      "id": "puzzle-<kebab-case>",\n` +
      `      "type": "cipher",\n` +
      `      "title": "The Brass Box Cipher",\n` +
      `      "description": "what the detective finds and must do, 1-2 sentences",\n` +
      `      "solutionCondition": "human-readable description of when puzzle is solved",\n` +
      `      "rewardedClueId": "<clue id from the available list above>",\n` +
      `      "hints": ["vague hint", "more specific", "points toward solution", "nearly explicit"]\n` +
      `    }\n` +
      `  ]\n` +
      `}\n\n` +
      `Rules:\n` +
      `- Generate one spec per label: ${puzzleLabels.join(', ')}\n` +
      `- label field must match the puzzle label exactly\n` +
      `- type: "cipher"|"lock"|"pattern"|"fragment"|"logic_grid"|"sequence"|"map"|"mechanical"\n` +
      `- rewardedClueId must be from the available clue IDs\n` +
      `- Choose puzzle types that fit the ${f.setting} setting`;

    return this.callLlm(prompt).pipe(
      map((raw) => this.parseJson<{ puzzleSpecs: PuzzleSpec[] }>(raw).puzzleSpecs),
    );
  }

  // ---------------------------------------------------------------------------
  // Step 7b â€” Puzzle HTML (one call per puzzle)
  // ---------------------------------------------------------------------------

  private step7bPuzzleHtml(spec: PuzzleSpec, style: string): Observable<PuzzleEvent> {
    const prompt =
      `Create a self-contained HTML puzzle for a detective mystery game.\n\n` +
      `Puzzle title: ${spec.title}\n` +
      `Type: ${spec.type}\n` +
      `Description: ${spec.description}\n` +
      `Solution condition: ${spec.solutionCondition}\n` +
      `Puzzle ID: ${spec.id}\n\n` +
      `Requirements:\n` +
      `- Complete valid HTML document starting with <!DOCTYPE html>\n` +
      `- ALL CSS and JS inline (no external files, no CDN links)\n` +
      `- Dark theme: background #1a1a2e, gold accents #c9a84c, cream text #e8e0d0\n` +
      `- Atmosphere matches: ${style}\n` +
      `- MUST call: window.parent.postMessage({type:"PUZZLE_SOLVED",puzzleId:"${spec.id}"},"*") exactly once when solved\n` +
      `- Must be solvable without outside knowledge\n` +
      `- No localStorage, sessionStorage, or cookies\n` +
      `- No alert() or confirm()\n` +
      `- Show a clear visual success state when solved\n\n` +
      `Output ONLY the raw HTML. No JSON wrapper, no markdown fences, no explanation.`;

    return this.callLlm(prompt).pipe(
      map((raw) => this.stripHtmlFences(raw)),
      map(
        (html): PuzzleEvent => ({
          id: spec.id,
          type: spec.type,
          title: spec.title,
          description: spec.description,
          htmlComponent: html,
          solutionCondition: spec.solutionCondition,
          rewardedClueId: spec.rewardedClueId,
          hints: spec.hints,
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

    return this.callLlm(prompt).pipe(map((raw) => this.parseJson<HintResult>(raw)));
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
      `Generate visual direction and UI theme for the detective mystery "${f.title}".\n` +
      `Style preference: ${style}\n` +
      `Setting: ${f.setting}\n` +
      `Case type: ${f.caseType}\n\n` +
      `Output ONLY raw JSON. No markdown fences.\n\n` +
      `{\n` +
      `  "visualDirection": {\n` +
      `    "artStyle": "...",\n` +
      `    "mood": "...",\n` +
      `    "colorPalette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],\n` +
      `    "lightingStyle": "...",\n` +
      `    "renderingStyle": "...",\n` +
      `    "globalStylePrompt": "compact Imagen style prefix for all images",\n` +
      `    "negativePrompt": "things to avoid in all images"\n` +
      `  },\n` +
      `  "uiTheme": {\n` +
      `    "primaryColor": "#1a1a2e",\n` +
      `    "secondaryColor": "#16213e",\n` +
      `    "accentColor": "#c9a84c",\n` +
      `    "surfaceColor": "#0f0f23",\n` +
      `    "textColor": "#e8e0d0",\n` +
      `    "panelStyle": "raised",\n` +
      `    "borderStyle": "1px solid rgba(201,168,76,0.3)",\n` +
      `    "shadowStyle": "0 4px 24px rgba(0,0,0,0.6)",\n` +
      `    "textureFamily": "paper"\n` +
      `  },\n` +
      `  "imagePromptTemplates": {\n` +
      `    "suspectPortrait": "${style}, portrait of {name}, {occupation}, {description}, dramatic lighting",\n` +
      `    "locationScene": "${style}, {name}, {atmosphere}, cinematic",\n` +
      `    "clueObject": "${style}, still life, {name}, {description}, moody",\n` +
      `    "eventSplash": "${style}, detective scene, atmospheric",\n` +
      `    "puzzleObject": "${style}, antique object, intricate detail"\n` +
      `  }\n` +
      `}\n\n` +
      `Rules:\n` +
      `- All hex colors must be valid 6-digit hex codes (#rrggbb)\n` +
      `- colorPalette must have 4-6 entries\n` +
      `- textureFamily: "paper"|"grain"|"cork"|"metal"|"leather"|"fabric"|"pixel_noise"\n` +
      `- panelStyle: "flat"|"raised"|"inset"\n` +
      `- uiTheme colors must complement the colorPalette and match the ${style} atmosphere`;

    return this.callLlm(prompt).pipe(map((raw) => this.parseJson<VisualResult>(raw)));
  }

  // ---------------------------------------------------------------------------
  // Assembly â€” combine all step outputs into a CasePackage
  // ---------------------------------------------------------------------------

  private assemble(ctx: GenCtx): CasePackage {
    // Resolve puzzleLabel â†’ puzzleId for event graph
    const labelToId = new Map(ctx.puzzleSpecs.map((s) => [s.label, s.id]));

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
  // HTTP wrapper â€” thin call to Gemma via Gemini API
  // ---------------------------------------------------------------------------

  private callLlm(prompt: string, attempt = 0): Observable<string> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'x-goog-api-key': environment.geminiApiKey,
    });

    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 8192,
      },
    };

    type GeminiResponse = { candidates: { content: { parts: { text: string }[] } }[] };

    return this.http.post<GeminiResponse>(environment.llmApiEndpoint, body, { headers }).pipe(
      map((resp) => resp.candidates[0].content.parts[0].text.trim()),
      catchError((err: Error) => {
        if (attempt < 2) return this.callLlm(prompt, attempt + 1);
        return throwError(() => new Error(`LLM call failed: ${err.message}`));
      }),
    );
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
    return raw
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
  }
}
