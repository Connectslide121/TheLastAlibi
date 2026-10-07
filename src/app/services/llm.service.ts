import { Injectable, inject, signal } from '@angular/core';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import {
  CasePackage,
  TruthLayer,
  Suspect,
  Location,
  InvestigationEvent,
  PuzzleEvent,
  UITheme,
  TimelineEvent,
} from '../models';
import { DebugRequestMeta } from './debug-trace.service';
import { WorkerLlmService, isQuotaError } from './worker-llm';
import { repairEventGraph } from '../utils/event-graph-repair';
import { normalizeCasePackage } from '../utils/normalize-case-package';
import { validatePuzzleConcept } from '../utils/puzzle-concept-validation';

import {
  Difficulty,
  CaseFoundation,
  LocationSpec,
  CluesResult,
  EventSpec,
  PuzzleConcept,
  VisualResult,
  HintResult,
  GenCtx,
  LlmCallOptions,
  GenerationStepStatus,
  STEP_DEFS,
  makeSteps,
} from './llm-generation.types';

import {
  buildFoundationPrompt,
  buildSuspectsPrompt,
  buildLocationsPrompt,
  buildCluesPrompt,
  buildTimelinePrompt,
  buildEventGraphPrompt,
  buildPuzzleConceptPrompt,
  buildPuzzleHtmlPrompt,
  buildHintLadderPrompt,
  buildVisualThemePrompt,
  buildSafeImagePrompt,
} from './llm-prompts';

export type { GenerationStepStatus };

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
          locations: this.step3Locations(foundation, stylePreference),
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
          clues: this.step4Clues(
            ctx.foundation,
            ctx.culpritSuspectId,
            ctx.suspects,
            ctx.locations,
            ctx.style,
          ),
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
  // Step 1 — Case Foundation
  // ---------------------------------------------------------------------------

  private step1Foundation(difficulty: Difficulty, style: string): Observable<CaseFoundation> {
    const seed = Math.floor(Math.random() * 1_000_000);
    const caseTypes = ['murder', 'theft', 'disappearance', 'sabotage', 'other'] as const;
    const caseType = caseTypes[Math.floor(Math.random() * caseTypes.length)];
    return this.callAndParseJson<CaseFoundation>(
      buildFoundationPrompt(difficulty, style, seed, caseType),
      {
        maxTokens: 1800,
        temperature: 0.8,
        debugMeta: { label: 'Case Foundation', category: 'case-foundation' },
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Step 2 — Suspects
  // ---------------------------------------------------------------------------

  private step2Suspects(
    f: CaseFoundation,
    style: string,
  ): Observable<{ culpritSuspectId: string; suspects: Suspect[] }> {
    return this.callAndParseJson<{ culpritSuspectId: string; suspects: Suspect[] }>(
      buildSuspectsPrompt(f, style),
      { maxTokens: 3200, temperature: 0.8, debugMeta: { label: 'Suspects', category: 'suspects' } },
    );
  }

  // ---------------------------------------------------------------------------
  // Step 3 — Locations
  // ---------------------------------------------------------------------------

  private step3Locations(f: CaseFoundation, style: string): Observable<LocationSpec[]> {
    return this.callAndParseJson<{ locations: LocationSpec[] }>(buildLocationsPrompt(f, style), {
      maxTokens: 1600,
      temperature: 0.7,
      debugMeta: { label: 'Locations', category: 'locations' },
    }).pipe(map((r) => r.locations));
  }

  // ---------------------------------------------------------------------------
  // Step 4 — Clues
  // ---------------------------------------------------------------------------

  private step4Clues(
    f: CaseFoundation,
    culpritSuspectId: string,
    suspects: Suspect[],
    locations: LocationSpec[],
    style: string,
  ): Observable<CluesResult> {
    return this.callAndParseJson<CluesResult>(
      buildCluesPrompt(f, culpritSuspectId, suspects, locations, style),
      {
        maxTokens: 2400,
        temperature: 0.75,
        debugMeta: { label: 'Clues & Evidence', category: 'clues' },
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Step 5 — Timeline
  // ---------------------------------------------------------------------------

  private step5Timeline(f: CaseFoundation, suspects: Suspect[]): Observable<TimelineEvent[]> {
    return this.callAndParseJson<{ timeline: TimelineEvent[] }>(buildTimelinePrompt(f, suspects), {
      maxTokens: 1800,
      temperature: 0.7,
      debugMeta: { label: 'Timeline', category: 'timeline' },
    }).pipe(map((r) => r.timeline));
  }

  // ---------------------------------------------------------------------------
  // Step 6 — Event Graph
  // ---------------------------------------------------------------------------

  private step6EventGraph(
    f: CaseFoundation,
    suspects: Suspect[],
    culpritSuspectId: string,
    clues: CluesResult,
    difficulty: Difficulty,
  ): Observable<EventSpec[]> {
    return this.callAndParseJson<{ events: EventSpec[] }>(
      buildEventGraphPrompt(f, suspects, culpritSuspectId, clues, difficulty),
      {
        maxTokens: 3200,
        temperature: 0.75,
        debugMeta: { label: 'Investigation Events', category: 'event-graph' },
      },
    ).pipe(map((r) => r.events));
  }

  // ---------------------------------------------------------------------------
  // Step 7 — Puzzle Concepts (no HTML)
  // ---------------------------------------------------------------------------

  private step7PuzzleConcepts(
    f: CaseFoundation,
    clues: CluesResult,
    events: EventSpec[],
  ): Observable<PuzzleConcept[]> {
    const puzzleEvents = events.filter(
      (event): event is EventSpec & { puzzleLabel: string } => !!event.puzzleLabel,
    );
    if (puzzleEvents.length === 0) return of([]);
    return forkJoin(puzzleEvents.map((event) => this.step7PuzzleConcept(f, clues, event)));
  }

  private step7PuzzleConcept(
    f: CaseFoundation,
    clues: CluesResult,
    event: EventSpec & { puzzleLabel: string },
    attempt = 0,
    previousFailures: string[] = [],
  ): Observable<PuzzleConcept> {
    const label = event.puzzleLabel;
    const puzzleId = `puzzle-${label}`;
    const rewardedClueId = event.rewardsClueIds[0] ?? clues.importantClueId;
    const retryGuidance =
      previousFailures.length > 0
        ? `\n\nYour previous attempt was rejected for these reasons:\n- ${previousFailures.join('\n- ')}\nReturn a corrected puzzle concept that fixes every issue explicitly.`
        : '';

    return this.callAndParseJson<PuzzleConcept>(
      buildPuzzleConceptPrompt(f, clues, event) + retryGuidance,
      {
        maxTokens: 1500,
        temperature: 0.65,
        debugMeta: {
          label: `Puzzle Concept: ${label}`,
          category: 'puzzle-concept',
          puzzleId,
          puzzleLabel: label,
        },
      },
    ).pipe(
      switchMap((concept) => {
        const normalizedConcept: PuzzleConcept = {
          ...concept,
          label,
          id: puzzleId,
          rewardedClueId,
          derivationSteps: concept.derivationSteps ?? [],
        };
        const validation = validatePuzzleConcept(normalizedConcept, clues.clues, rewardedClueId);

        if (!validation.isValid && attempt < 2) {
          return this.step7PuzzleConcept(f, clues, event, attempt + 1, validation.reasons);
        }

        if (!validation.isValid) {
          return throwError(
            () =>
              new Error(
                `Puzzle concept ${puzzleId} failed validation after ${attempt + 1} attempts: ${validation.reasons.join(' ')}`,
              ),
          );
        }

        return of(normalizedConcept);
      }),
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
    return this.callPuzzle(buildPuzzleHtmlPrompt(concept, style, theme), {
      debugMeta: {
        label: `Puzzle HTML: ${concept.label}`,
        category: 'puzzle-html',
        puzzleId: concept.id,
        puzzleLabel: concept.label,
      },
    }).pipe(
      map((raw) => this.coercePuzzleHtml(raw, concept, theme)),
      map(
        (html): PuzzleEvent => ({
          id: concept.id,
          type: concept.puzzleType,
          title: concept.puzzleTitle,
          description: concept.puzzleDescription,
          interactionInstructions: concept.interactionInstructions,
          visibleClues: concept.clues,
          answerPrompt: concept.answerPrompt,
          answerPlaceholder: concept.answerPlaceholder,
          answerFormat: concept.answerFormat,
          acceptableAnswers: concept.acceptableAnswers,
          validationLogic: concept.validationLogic,
          uiConcept: concept.uiConcept,
          htmlComponent: html,
          solutionCondition: concept.solution,
          rewardedClueId: concept.rewardedClueId,
          hints: concept.hints,
        }),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Step 8 — Hint Ladder + Solution Explanation
  // ---------------------------------------------------------------------------

  private step8HintsAndSolution(
    f: CaseFoundation,
    suspects: Suspect[],
    culpritSuspectId: string,
    clues: CluesResult,
    events: EventSpec[],
  ): Observable<HintResult> {
    return this.callAndParseJson<HintResult>(
      buildHintLadderPrompt(f, suspects, culpritSuspectId, clues, events),
      {
        maxTokens: 2200,
        temperature: 0.7,
        debugMeta: { label: 'Hint Ladder', category: 'hint-ladder' },
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Step 9 — Visual Direction + UI Theme + Image Templates
  // ---------------------------------------------------------------------------

  private step9Visual(
    f: CaseFoundation,
    _suspects: Suspect[],
    style: string,
  ): Observable<VisualResult> {
    return this.callAndParseJson<VisualResult>(buildVisualThemePrompt(f, style), {
      maxTokens: 2200,
      temperature: 0.75,
      debugMeta: { label: 'Visual Theme', category: 'visual-theme' },
    });
  }

  // ---------------------------------------------------------------------------
  // Assembly â€” combine all step outputs into a CasePackage
  // ---------------------------------------------------------------------------

  private assemble(ctx: GenCtx): CasePackage {
    // Resolve puzzleLabel â†’ puzzleId for event graph
    const labelToId = new Map(ctx.puzzleConcepts.map((concept) => [concept.label, concept.id]));

    const rawEventGraph: InvestigationEvent[] = ctx.events.map((e) => ({
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
      examinationSpots: e.examinationSpots ?? undefined,
    }));

    // Repair any silent deadlocks before storing the case.
    const eventGraph = repairEventGraph(rawEventGraph);

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

    return normalizeCasePackage({
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
    });
  }

  // ---------------------------------------------------------------------------
  // Worker transport wrappers
  // ---------------------------------------------------------------------------

  private callText(prompt: string, options: LlmCallOptions = {}, attempt = 0): Observable<string> {
    return this.workerLlm.generateText({ prompt, ...options }).pipe(
      catchError((err: Error) => {
        // An exhausted daily quota will not recover on a retry.
        if (isQuotaError(err)) return throwError(() => err);
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
        if (isQuotaError(err)) return throwError(() => err);
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
    return this.callText(buildSafeImagePrompt(originalPrompt), {
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

  private coercePuzzleHtml(raw: string, concept: PuzzleConcept, theme: UITheme): string {
    const html = this.stripHtmlFences(raw);
    const isDocumentLike = /<!DOCTYPE html>|<html[\s>]/i.test(html);
    const hasForbiddenApis =
      /localStorage|sessionStorage|document\.cookie|<script[^>]+src=|<link[^>]+href=/i.test(html);

    if (!html || !isDocumentLike || hasForbiddenApis) {
      return this.buildPuzzleFallbackHtml(concept, theme);
    }

    return html;
  }

  private buildPuzzleFallbackHtml(concept: PuzzleConcept, theme: UITheme): string {
    const clueItems = concept.clues.map((clue) => `<li>${this.escapeHtml(clue)}</li>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${this.escapeHtml(concept.puzzleTitle)}</title>
  <style>
    :root {
      color-scheme: dark;
    }
    body {
      margin: 0;
      font-family: Georgia, serif;
      background: ${theme.primaryColor};
      color: ${theme.textColor};
      padding: 24px;
    }
    .panel {
      max-width: 720px;
      margin: 0 auto;
      background: ${theme.secondaryColor};
      border: 1px solid ${theme.accentColor};
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
    }
    h1 {
      margin: 0 0 8px;
      color: ${theme.accentColor};
      font-size: 1.4rem;
    }
    p, li {
      line-height: 1.5;
    }
    ul {
      margin: 12px 0 0;
      padding-left: 20px;
    }
    .note {
      margin-top: 16px;
      padding: 12px;
      border-radius: 12px;
      background: ${theme.surfaceColor};
    }
  </style>
</head>
<body>
  <section class="panel">
    <h1>${this.escapeHtml(concept.puzzleTitle)}</h1>
    <p>${this.escapeHtml(concept.puzzleDescription)}</p>
    <p>${this.escapeHtml(concept.interactionInstructions)}</p>
    <ul>${clueItems}</ul>
    <div class="note">Use the case file panel outside this exhibit to submit your answer.</div>
  </section>
</body>
</html>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
