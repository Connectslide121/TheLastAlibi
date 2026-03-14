import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
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
  PuzzleEvent,
  VisualDirection,
  UITheme,
  ImagePromptTemplates,
  Hint,
  SolutionExplanation,
  DialogueLine,
  UnlockCondition,
} from '../models';

type Difficulty = CaseMetadata['difficulty'];

@Injectable({ providedIn: 'root' })
export class LlmService {
  private readonly http = inject(HttpClient);

  generateCasePackage(difficulty: Difficulty, stylePreference: string): Observable<CasePackage> {
    return this.callLlm(this.buildMasterPrompt(difficulty, stylePreference), 0);
  }

  // ---------------------------------------------------------------------------
  // Private – LLM call with retry
  // ---------------------------------------------------------------------------

  private callLlm(prompt: string, attempt: number): Observable<CasePackage> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'x-goog-api-key': environment.geminiApiKey,
    });

    const body = {
      systemInstruction: {
        parts: [
          {
            text: 'You are a creative mystery game writer. Always respond with valid JSON only. No markdown, no code fences, no explanation — raw JSON matching the requested structure exactly.',
          },
        ],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    };

    type GeminiResponse = { candidates: { content: { parts: { text: string }[] } }[] };

    return this.http.post<GeminiResponse>(environment.llmApiEndpoint, body, { headers }).pipe(
      map((response) => {
        const raw = response.candidates[0].content.parts[0].text.trim();
        return this.parseAndValidate(raw);
      }),
      catchError((err) => {
        if (attempt < 2) {
          return this.callLlm(prompt, attempt + 1);
        }
        return throwError(
          () => new Error(`LLM generation failed after ${attempt + 1} attempts: ${err.message}`),
        );
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Private – JSON parsing & validation
  // ---------------------------------------------------------------------------

  private parseAndValidate(raw: string): CasePackage {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('LLM response was not valid JSON');
    }

    if (!this.isValidCasePackage(parsed)) {
      throw new Error('LLM response is missing required CasePackage fields');
    }

    return parsed as CasePackage;
  }

  private isValidCasePackage(obj: unknown): boolean {
    if (typeof obj !== 'object' || obj === null) return false;
    const p = obj as Record<string, unknown>;
    return (
      typeof p['id'] === 'string' &&
      typeof p['metadata'] === 'object' &&
      typeof p['truth'] === 'object' &&
      Array.isArray(p['suspects']) &&
      Array.isArray(p['locations']) &&
      Array.isArray(p['clues']) &&
      Array.isArray(p['timeline']) &&
      Array.isArray(p['eventGraph']) &&
      typeof p['visualDirection'] === 'object' &&
      typeof p['uiTheme'] === 'object'
    );
  }

  // ---------------------------------------------------------------------------
  // Private – Master prompt builder
  // ---------------------------------------------------------------------------

  private buildMasterPrompt(difficulty: Difficulty, style: string): string {
    return `
Generate a complete detective mystery case as a single JSON object matching the TypeScript interface below.
Difficulty: ${difficulty}
Art style / tone preference: ${style}

Return ONLY raw JSON. No markdown, no prose.

The top-level object must match:
{
  "id": "<uuid>",
  "generatedAt": "<ISO timestamp>",
  "metadata": { ${this.buildMetadataPrompt(difficulty)} },
  "truth": { ${this.buildTruthPrompt()} },
  "suspects": [ ${this.buildSuspectsPrompt()} ],
  "locations": [ ${this.buildLocationsPrompt()} ],
  "clues": [ ${this.buildCluesPrompt()} ],
  "timeline": [ ${this.buildTimelinePrompt()} ],
  "eventGraph": [ ${this.buildEventGraphPrompt()} ],
  "puzzles": [ ${this.buildPuzzlesPrompt()} ],
  "hintLadder": [ ${this.buildHintLadderPrompt()} ],
  "solutionExplanation": { ${this.buildSolutionExplanationPrompt()} },
  "visualDirection": { ${this.buildVisualDirectionPrompt()} },
  "uiTheme": { ${this.buildUIThemePrompt()} },
  "imagePromptTemplates": { ${this.buildImagePromptTemplatesPrompt()} }
}

Requirements:
- Generate exactly 5 suspects (one is the culprit, 1–2 are red herrings, rest are innocent bystanders with secrets)
- Generate exactly 5 locations
- Generate 8–12 clues (at least 2 red herrings)
- Generate exactly 10 timeline events (mix of true and false)
- Generate 6–10 investigation events spread across acts 1, 2, 3
- Generate 2–3 puzzles of varying types
- Generate a hint ladder with 5 hints ordered from vague to explicit
- All IDs must be lowercase kebab-case strings that are unique within their array
- Suspect "interviewDialogue" must have at least 3 DialogueLine entries per suspect
- All image prompts must include the visual style from visualDirection.globalStylePrompt
`.trim();
  }

  // ---------------------------------------------------------------------------
  // Private – Per-section prompt fragments
  // ---------------------------------------------------------------------------

  private buildMetadataPrompt(difficulty: Difficulty): string {
    return `
"title": "...", "subtitle": "...",
"caseType": one of "murder"|"theft"|"disappearance"|"sabotage"|"other",
"difficulty": "${difficulty}",
"setting": "...",
"briefing": "...",
"act1Summary": "...", "act2Summary": "...", "act3Summary": "..."
`.trim();
  }

  private buildTruthPrompt(): string {
    return `
"culpritId": "<suspect id>",
"motive": "...", "method": "...", "trueTimeline": "...",
"keyContradiction": "...", "importantClueId": "<clue id>",
"redHerringExplanation": "...",
"lyingSuspectIds": [...], "mistakenSuspectIds": [...],
"hidingSecretSuspectIds": [...], "revealingClueIds": [...], "redHerringClueIds": [...]
`.trim();
  }

  private buildSuspectsPrompt(): string {
    return `
{
  "id": "...", "name": "...", "age": 0, "occupation": "...",
  "relationship": "...", "description": "...", "personality": "...",
  "alibi": "...", "secretUnrelatedToCase": "...",
  "isLying": false, "isMistaken": false, "isHidingSecret": false,
  "interviewDialogue": [{ "speakerId": "...", "speakerName": "...", "text": "...", "revealsTruth": false }],
  "imagePrompt": "..."
}
`.trim();
  }

  private buildLocationsPrompt(): string {
    return `
{
  "id": "...", "name": "...", "description": "...", "atmosphere": "...",
  "cluesFoundHere": [], "imagePrompt": "..."
}
`.trim();
  }

  private buildCluesPrompt(): string {
    return `
{
  "id": "...", "name": "...", "description": "...", "locationId": "...",
  "isRedHerring": false, "revealsInfo": "...", "imagePrompt": "..."
}
`.trim();
  }

  private buildTimelinePrompt(): string {
    return `
{ "id": "...", "time": "...", "description": "...", "involvedSuspectIds": [], "isTrue": true }
`.trim();
  }

  private buildEventGraphPrompt(): string {
    return `
{
  "id": "...",
  "category": one of "investigation"|"social"|"surprise"|"puzzle"|"deduction",
  "type": "...", "title": "...", "description": "...",
  "act": 1,
  "isMandatory": true,
  "unlockConditions": [{ "type": "event_completed"|"clue_found"|"act_reached", "referenceId": "..." }],
  "rewardsClueIds": [], "unlocksSuspectIds": [],
  "puzzleId": null, "dialogueSuspectId": null,
  "narration": "...", "isCompleted": false
}
`.trim();
  }

  private buildPuzzlesPrompt(): string {
    return `
{
  "id": "...",
  "type": one of "cipher"|"lock"|"pattern"|"fragment"|"logic_grid"|"sequence"|"map"|"mechanical",
  "title": "...", "description": "...",
  "htmlComponent": "<!-- puzzle HTML/CSS/JS as a self-contained snippet -->",
  "solutionCondition": "...", "rewardedClueId": "...", "hints": ["..."]
}
`.trim();
  }

  private buildHintLadderPrompt(): string {
    return `
{ "index": 0, "text": "...", "targetsEventId": "..." }
`.trim();
  }

  private buildSolutionExplanationPrompt(): string {
    return `
"narrative": "...",
"stepsExplained": ["..."],
"redHerringExplanations": ["..."]
`.trim();
  }

  private buildVisualDirectionPrompt(): string {
    return `
"artStyle": "...", "mood": "...",
"colorPalette": ["#hex", ...],
"lightingStyle": "...", "renderingStyle": "...",
"globalStylePrompt": "...", "negativePrompt": "..."
`.trim();
  }

  private buildUIThemePrompt(): string {
    return `
"primaryColor": "#hex", "secondaryColor": "#hex",
"accentColor": "#hex", "surfaceColor": "#hex", "textColor": "#hex",
"panelStyle": "flat"|"raised"|"inset",
"borderStyle": "...", "shadowStyle": "...",
"textureFamily": "paper"|"grain"|"cork"|"metal"|"leather"|"fabric"|"pixel_noise"
`.trim();
  }

  private buildImagePromptTemplatesPrompt(): string {
    return `
"suspectPortrait": "...", "locationScene": "...",
"clueObject": "...", "eventSplash": "...", "puzzleObject": "..."
`.trim();
  }
}
