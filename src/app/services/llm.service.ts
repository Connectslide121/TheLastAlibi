import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { CasePackage, CaseMetadata } from '../models';

type Difficulty = CaseMetadata['difficulty'];

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

@Injectable({ providedIn: 'root' })
export class LlmService {
  private readonly http = inject(HttpClient);

  generateCasePackage(difficulty: Difficulty, stylePreference: string): Observable<CasePackage> {
    return this.callLlm(this.buildMasterPrompt(difficulty, stylePreference), 0).pipe(
      switchMap((pkg) => {
        const result = this.validateCrossReferences(pkg);
        if (result.valid) return [pkg];
        // One correction attempt with the specific errors listed
        return this.callLlm(this.buildCorrectionPrompt(pkg, result.errors), 0);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Private – LLM call with retry
  // ---------------------------------------------------------------------------

  private callLlm(prompt: string, attempt: number): Observable<CasePackage> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'x-goog-api-key': environment.geminiApiKey,
    });

    const systemPrefix =
      'You are a master crime-fiction writer and game designer. Your only output is raw, valid JSON — no markdown fences, no prose, no explanation. Every ID field must be a unique kebab-case string. All cross-referenced IDs must exist in their respective arrays.\n\n';

    const body = {
      contents: [{ role: 'user', parts: [{ text: systemPrefix + prompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 8192,
      },
    };

    type GeminiResponse = { candidates: { content: { parts: { text: string }[] } }[] };

    return this.http.post<GeminiResponse>(environment.llmApiEndpoint, body, { headers }).pipe(
      map((response) => {
        const raw = response.candidates[0].content.parts[0].text.trim();
        return this.parseAndValidate(raw);
      }),
      catchError((err: Error) => {
        if (attempt < 1) return this.callLlm(prompt, attempt + 1);
        return throwError(
          () => new Error(`LLM generation failed after ${attempt + 1} attempts: ${err.message}`),
        );
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Private – JSON parsing & structural validation
  // ---------------------------------------------------------------------------

  private parseAndValidate(raw: string): CasePackage {
    // Strip markdown fences the model may still emit despite instructions
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error('LLM response is not valid JSON');
    }
    if (!this.hasRequiredFields(parsed)) {
      throw new Error('LLM response is missing required CasePackage top-level fields');
    }
    return parsed as CasePackage;
  }

  private hasRequiredFields(obj: unknown): boolean {
    if (typeof obj !== 'object' || obj === null) return false;
    const p = obj as Record<string, unknown>;
    return (
      typeof p['id'] === 'string' &&
      typeof p['metadata'] === 'object' &&
      p['metadata'] !== null &&
      typeof p['truth'] === 'object' &&
      p['truth'] !== null &&
      Array.isArray(p['suspects']) &&
      (p['suspects'] as unknown[]).length >= 3 &&
      Array.isArray(p['locations']) &&
      (p['locations'] as unknown[]).length >= 2 &&
      Array.isArray(p['clues']) &&
      (p['clues'] as unknown[]).length >= 4 &&
      Array.isArray(p['timeline']) &&
      Array.isArray(p['eventGraph']) &&
      (p['eventGraph'] as unknown[]).length >= 1 &&
      Array.isArray(p['puzzles']) &&
      Array.isArray(p['hintLadder']) &&
      typeof p['solutionExplanation'] === 'object' &&
      typeof p['uiTheme'] === 'object'
    );
  }

  // ---------------------------------------------------------------------------
  // Private – Cross-reference validation
  // ---------------------------------------------------------------------------

  private validateCrossReferences(pkg: CasePackage): ValidationResult {
    const errors: string[] = [];

    const suspectIds = new Set(pkg.suspects.map((s) => s.id));
    const clueIds = new Set(pkg.clues.map((c) => c.id));
    const locationIds = new Set(pkg.locations.map((l) => l.id));
    const eventIds = new Set(pkg.eventGraph.map((e) => e.id));
    const puzzleIds = new Set(pkg.puzzles.map((p) => p.id));

    // truth cross-refs
    if (!suspectIds.has(pkg.truth.culpritId))
      errors.push(`truth.culpritId "${pkg.truth.culpritId}" does not match any suspect id`);
    if (!clueIds.has(pkg.truth.importantClueId))
      errors.push(
        `truth.importantClueId "${pkg.truth.importantClueId}" does not match any clue id`,
      );

    pkg.truth.lyingSuspectIds.forEach((id) => {
      if (!suspectIds.has(id)) errors.push(`truth.lyingSuspectIds: "${id}" not in suspects`);
    });
    pkg.truth.revealingClueIds.forEach((id) => {
      if (!clueIds.has(id)) errors.push(`truth.revealingClueIds: "${id}" not in clues`);
    });
    pkg.truth.redHerringClueIds.forEach((id) => {
      if (!clueIds.has(id)) errors.push(`truth.redHerringClueIds: "${id}" not in clues`);
    });

    // clue locationIds
    pkg.clues.forEach((c) => {
      if (!locationIds.has(c.locationId))
        errors.push(`clue "${c.id}".locationId "${c.locationId}" not in locations`);
    });

    // event graph
    pkg.eventGraph.forEach((e) => {
      if (e.puzzleId && !puzzleIds.has(e.puzzleId))
        errors.push(`event "${e.id}".puzzleId "${e.puzzleId}" not in puzzles`);
      if (e.dialogueSuspectId && !suspectIds.has(e.dialogueSuspectId))
        errors.push(`event "${e.id}".dialogueSuspectId "${e.dialogueSuspectId}" not in suspects`);
      e.rewardsClueIds.forEach((id) => {
        if (!clueIds.has(id)) errors.push(`event "${e.id}".rewardsClueIds: "${id}" not in clues`);
      });
      e.unlocksSuspectIds.forEach((id) => {
        if (!suspectIds.has(id))
          errors.push(`event "${e.id}".unlocksSuspectIds: "${id}" not in suspects`);
      });
      e.unlockConditions.forEach((cond) => {
        if (cond.type === 'event_completed' && !eventIds.has(cond.referenceId))
          errors.push(`event "${e.id}" condition references unknown event "${cond.referenceId}"`);
        if (cond.type === 'clue_found' && !clueIds.has(cond.referenceId))
          errors.push(`event "${e.id}" condition references unknown clue "${cond.referenceId}"`);
      });
    });

    // puzzles
    pkg.puzzles.forEach((p) => {
      if (!clueIds.has(p.rewardedClueId))
        errors.push(`puzzle "${p.id}".rewardedClueId "${p.rewardedClueId}" not in clues`);
    });

    // at least one red-herring clue
    const hasRedHerring = pkg.clues.some((c) => c.isRedHerring);
    if (!hasRedHerring) errors.push('No red herring clue found — at least 1 required');

    if (errors.length > 0) {
      console.warn('[LlmService] cross-reference validation failures:', errors);
    }

    return { valid: errors.length === 0, errors };
  }

  // ---------------------------------------------------------------------------
  // Private – Master prompt builder
  // ---------------------------------------------------------------------------

  private buildMasterPrompt(difficulty: Difficulty, style: string): string {
    const difficultyGuidance: Record<Difficulty, string> = {
      easy: 'Simple case: 3 suspects, obvious motive, 1 red herring, 1 puzzle, short act summaries. The culprit is identifiable from Act 1 clues alone.',
      normal:
        'Moderate case: 4-5 suspects, layered motive, 2 red herrings, 2 puzzles. Culprit is identifiable after Act 2.',
      hard: 'Complex case: 5 suspects, obscured motive, 2-3 red herrings, 3 puzzles, deduction events that contradict apparent evidence. Culprit only clear in Act 3.',
      genius:
        'Masterwork case: 5 suspects all with plausible motives, 3 red herrings carefully constructed to mislead, 3 puzzles with cryptic clues, multiple twists. The truth requires careful cross-referencing of all evidence.',
    };

    return `You are writing a complete detective mystery case package for a single-player mystery game called "The Last Alibi".

DIFFICULTY: ${difficulty} — ${difficultyGuidance[difficulty]}
ART STYLE / TONE: ${style}

Generate a SINGLE raw JSON object with NO markdown fences, NO explanations. The entire response must be parseable by JSON.parse().

The JSON structure must exactly match this schema. Field types are shown in <angle_brackets>.

{
  "id": <unique kebab-case uuid e.g. "case-the-garden-party-murder">,
  "generatedAt": <ISO 8601 timestamp>,

  "metadata": {
    "title": <evocative case title, e.g. "The Garden Party Murder">,
    "subtitle": <one-line tagline, e.g. "Everyone had a reason to want him dead">,
    "caseType": <one of: "murder" | "theft" | "disappearance" | "sabotage" | "other">,
    "difficulty": "${difficulty}",
    "setting": <time period + location, e.g. "1930s English country manor">,
    "briefing": <2-3 sentence briefing the detective reads on arrival — what happened, when, who reported it>,
    "act1Summary": <what the player discovers in Act 1>,
    "act2Summary": <what deepens in Act 2>,
    "act3Summary": <how the truth crystallises in Act 3>
  },

  "truth": {
    "culpritId": <id from suspects array — MUST exist>,
    "motive": <specific motive, e.g. "To reclaim the inheritance she was denied">,
    "method": <specific method, e.g. "Arsenic dissolved in the evening brandy">,
    "trueTimeline": <paragraph describing what actually happened chronologically>,
    "keyContradiction": <the single most important logical contradiction that exposes the culprit>,
    "importantClueId": <id from clues array — the smoking-gun clue — MUST exist>,
    "redHerringExplanation": <why the red herrings seemed suspicious but weren't>,
    "lyingSuspectIds": [<ids from suspects array>],
    "mistakenSuspectIds": [<ids from suspects array>],
    "hidingSecretSuspectIds": [<ids from suspects array>],
    "revealingClueIds": [<ids from clues array — 2-3 clues that together prove guilt>],
    "redHerringClueIds": [<ids from clues array — marked isRedHerring: true>]
  },

  "suspects": [
    {
      "id": <unique kebab-case>,
      "name": <full name>,
      "age": <number>,
      "occupation": <job title>,
      "relationship": <relationship to victim>,
      "description": <physical appearance + first impression>,
      "personality": <dominant character traits>,
      "alibi": <what they claim they were doing at time of crime>,
      "secretUnrelatedToCase": <embarrassing or personal secret that makes them seem suspicious but is unrelated>,
      "isLying": <boolean — true if alibi is false>,
      "isMistaken": <boolean — true if they believe something false about the events>,
      "isHidingSecret": <boolean>,
      "interviewDialogue": [
        {
          "speakerId": <suspect id>,
          "speakerName": <suspect name>,
          "text": <what they say when interviewed — 1-2 sentences>,
          "revealsTruth": <boolean — true if this line reveals accurate information>
        }
        // Include AT LEAST 4 dialogue lines per suspect
      ],
      "imagePrompt": <Stable Diffusion/Imagen prompt for a portrait — include art style>
    }
    // Generate exactly 5 suspects. One is the culprit. At least 1 is a deliberate red herring.
  ],

  "locations": [
    {
      "id": <unique kebab-case>,
      "name": <location name>,
      "description": <what the detective sees here>,
      "atmosphere": <sensory details — smell, light, sounds>,
      "cluesFoundHere": [<ids from clues array>],
      "imagePrompt": <Imagen prompt for the location scene>
    }
    // Generate exactly 5 locations. Each clue must reference one of these via locationId.
  ],

  "clues": [
    {
      "id": <unique kebab-case>,
      "name": <short evidence name, e.g. "Torn letter fragment">,
      "description": <what the detective observes — 1-2 sentences>,
      "locationId": <id from locations array — MUST exist>,
      "isRedHerring": <boolean — true if this clue leads away from the truth>,
      "revealsInfo": <what this clue logically tells the detective>,
      "imagePrompt": <Imagen prompt for the clue object>
    }
    // Generate 8-12 clues. At least 2 must have isRedHerring: true. At least 3 must have isRedHerring: false and form a connected chain to the culprit.
  ],

  "timeline": [
    {
      "id": <unique kebab-case>,
      "time": <e.g. "7:30 PM" or "Two days before the incident">,
      "description": <one sentence describing this event>,
      "involvedSuspectIds": [<ids from suspects array>],
      "isTrue": <boolean — false if this is rumour/misdirection>
    }
    // Exactly 10 entries. Mix true and false. Include the actual moment of the crime as isTrue: true.
  ],

  "eventGraph": [
    {
      "id": <unique kebab-case>,
      "category": <one of: "investigation" | "social" | "surprise" | "puzzle" | "deduction">,
      "type": <short camelCase descriptor, e.g. "searchRoom", "interviewSuspect", "solveCipher">,
      "title": <player-facing title, e.g. "Search the library">,
      "description": <1-sentence teaser shown before the player selects this event>,
      "act": <1, 2, or 3>,
      "isMandatory": <boolean — true if this event must be completed to progress>,
      "unlockConditions": [
        { "type": "event_completed" | "clue_found" | "act_reached", "referenceId": <id that MUST exist in the appropriate array> }
      ],
      "rewardsClueIds": [<ids from clues array — what this event reveals>],
      "unlocksSuspectIds": [<ids from suspects array — new suspects this event makes available>],
      "puzzleId": <id from puzzles array, or null if not a puzzle event>,
      "dialogueSuspectId": <id from suspects array for social events, or null>,
      "narration": <2-4 sentence scene description read aloud when the player selects this event>
    }
    // Generate 6-10 events spread across all 3 acts. Act 1 must have at least 2 events with unlockConditions: [].
    // Mandatory Act 1 events should lead naturally into Act 2 via their rewardsClueIds unlocking Act 2 events.
    // Do NOT create circular unlock conditions.
  ],

  "puzzles": [
    {
      "id": <unique kebab-case>,
      "type": <one of: "cipher" | "lock" | "pattern" | "fragment" | "logic_grid" | "sequence" | "map" | "mechanical">,
      "title": <puzzle name>,
      "description": <what the detective finds and must do>,
      "htmlComponent": <COMPLETE self-contained HTML string — ALL CSS and JS must be inline. The puzzle must call window.parent.postMessage({type:'PUZZLE_SOLVED', puzzleId:'<this puzzle id>'}, '*') exactly once when solved. No external URLs. No localStorage. No alert(). Puzzle must be solvable without outside knowledge.>,
      "solutionCondition": <human-readable description of the correct answer>,
      "rewardedClueId": <id from clues array — MUST exist>,
      "hints": [<3-4 progressive hints from vague to explicit>]
    }
    // Generate 2-3 puzzles. Types should vary. Each must have a working htmlComponent.
  ],

  "hintLadder": [
    { "index": 0, "text": <very vague hint>, "targetsEventId": <event id or null> },
    { "index": 1, "text": <slightly more specific>, "targetsEventId": <event id or null> },
    { "index": 2, "text": <points toward a specific suspect>, "targetsEventId": <event id or null> },
    { "index": 3, "text": <narrows down the method>, "targetsEventId": <event id or null> },
    { "index": 4, "text": <explicit hint — nearly gives it away>, "targetsEventId": <event id or null> }
  ],

  "solutionExplanation": {
    "narrative": <3-5 paragraph prose narrative of the full truth — written like the end of a classic detective novel>,
    "stepsExplained": [
      <step 1: the inciting event>,
      <step 2: how the culprit planned or acted>,
      <step 3: how they tried to cover it up>,
      <step 4: the key contradiction that exposes them>,
      <step 5: final conclusion>
    ],
    "redHerringExplanations": [<one sentence per red herring clue explaining why it seemed incriminating but wasn't>]
  },

  "visualDirection": {
    "artStyle": <description matching stylePreference: "${style}">,
    "mood": <e.g. "gothic and claustrophobic">,
    "colorPalette": [<4-6 hex colors that define the visual mood>],
    "lightingStyle": <e.g. "chiaroscuro candlelight">,
    "renderingStyle": <e.g. "oil painting with visible brushstrokes">,
    "globalStylePrompt": <compact Imagen style prefix to prepend to all image prompts, e.g. "noir oil painting, dramatic shadows, 1930s aesthetic, muted sepia tones">,
    "negativePrompt": <things to exclude from images, e.g. "anime, cartoon, modern technology, bright colours">
  },

  "uiTheme": {
    "primaryColor": <hex — main background>,
    "secondaryColor": <hex — panel/card background>,
    "accentColor": <hex — highlights, headings, borders>,
    "surfaceColor": <hex — elevated surfaces>,
    "textColor": <hex — body text>,
    "textMutedColor": <hex — secondary text>,
    "panelStyle": <"flat" | "raised" | "inset">,
    "borderStyle": <CSS border shorthand, e.g. "1px solid rgba(201,168,76,0.3)">,
    "shadowStyle": <CSS box-shadow, e.g. "0 4px 24px rgba(0,0,0,0.6)">,
    "textureFamily": <"paper" | "grain" | "cork" | "metal" | "leather" | "fabric" | "pixel_noise">
  },

  "imagePromptTemplates": {
    "suspectPortrait": <template string with {name}, {occupation}, {description} placeholders>,
    "locationScene": <template string with {name}, {atmosphere} placeholders>,
    "clueObject": <template string with {name}, {description} placeholders>,
    "eventSplash": <template string>,
    "puzzleObject": <template string>
  }
}

HARD CONSTRAINTS — violating any of these will cause the game to break:
1. Every id field must be unique within its array and must only contain lowercase letters, digits, and hyphens.
2. truth.culpritId MUST exactly match an id in the suspects array.
3. truth.importantClueId MUST exactly match an id in the clues array.
4. Every clue.locationId MUST exactly match an id in the locations array.
5. Every eventGraph entry's puzzleId (if non-null) MUST match a puzzle id.
6. Every eventGraph entry's dialogueSuspectId (if non-null) MUST match a suspect id.
7. Every id referenced in rewardsClueIds, unlocksSuspectIds MUST exist in their respective arrays.
8. Every unlockCondition.referenceId MUST exist in the appropriate array for its type.
9. puzzle.rewardedClueId MUST match a clue id.
10. Unlock conditions must NOT create circular dependencies.
11. At least 1 clue must have isRedHerring: true.
12. Act 1 must have at least 2 events with empty unlockConditions arrays.
13. The htmlComponent for every puzzle must be a complete, working, self-contained HTML document as a string that calls window.parent.postMessage when solved.`;
  }

  // ---------------------------------------------------------------------------
  // Private – Correction prompt
  // ---------------------------------------------------------------------------

  private buildCorrectionPrompt(brokenPkg: CasePackage, errors: string[]): string {
    return `The following JSON case package has cross-reference errors that must be fixed.
Return the CORRECTED full JSON object (same structure) with ONLY these issues fixed — do not change anything else.

ERRORS TO FIX:
${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}

BROKEN JSON:
${JSON.stringify(brokenPkg)}`;
  }
}
