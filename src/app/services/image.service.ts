import { Injectable, inject } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError, finalize, map, mergeMap, shareReplay, switchMap } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { CasePackage } from '../models';
import type { GameState } from '../models/game-state.model';
import { DebugTraceService } from './debug-trace.service';
import { LlmService } from './llm.service';
import { getCachedImage, setCachedImage, hashPrompt, CachedImage } from '../utils/image-cache';

/** Object URL registry — allows revocation when images are replaced. */
const activeObjectUrls = new Set<string>();

function trackAndReturn(url: string): string {
  activeObjectUrls.add(url);
  return url;
}

export function revokeImageUrl(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
    activeObjectUrls.delete(url);
  }
}

// ---------------------------------------------------------------------------
// Entity dimension hints — Flux works best with explicit sizes
// ---------------------------------------------------------------------------
const DIMENSIONS: Record<string, { width: number; height: number }> = {
  case: { width: 768, height: 512 },
  suspect: { width: 512, height: 512 },
  location: { width: 768, height: 512 },
  clue: { width: 512, height: 512 },
};

export type ImageEntityType = 'case' | 'suspect' | 'location' | 'clue';

/** Decides which of a case's images are wanted right now. */
export type ImageScope = (entityType: ImageEntityType, entityId: string) => boolean;

export const ALL_IMAGES: ImageScope = () => true;

/**
 * The images a player has a reason to see yet, from their progress: the
 * briefing, the banner for the current act and the next one (fetched ahead so
 * it is ready when the act opens), and the suspects, locations and clues they
 * have reached.
 *
 * Images are generated on Cloudflare's free Workers AI tier, where one image
 * costs about as much as a tenth of a day's allowance. Generating all of a
 * case's ~25 images up front cost more than two days of it, so they are made
 * when they are first needed instead.
 */
export function imagesReached(state: GameState | null): ImageScope {
  const act = state?.currentAct ?? 1;
  const suspects = new Set([
    ...(state?.unlockedSuspectIds ?? []),
    ...(state?.interviewedSuspectIds ?? []),
  ]);
  const locations = new Set(state?.visitedLocationIds ?? []);
  const clues = new Set(state?.foundClueIds ?? []);
  return (entityType, entityId) => {
    switch (entityType) {
      case 'case': {
        const actImage = entityId.match(/-act([123])ImageUrl$/);
        return !actImage || Number(actImage[1]) <= act + 1;
      }
      case 'suspect':
        return suspects.has(entityId);
      case 'location':
        return locations.has(entityId);
      case 'clue':
        return clues.has(entityId);
    }
  };
}

const SAFE_PROMPT_VERSION = 'safe-prompt-v1';
const IMAGE_BATCH_CONCURRENCY = 3;

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly llm = inject(LlmService);
  private readonly debug = inject(DebugTraceService);
  private readonly safePromptCache = new Map<string, Observable<string>>();
  private readonly inFlightImageRequests = new Map<string, Observable<string>>();

  /**
   * Generate a single image.
   *
   * @param prompt       Final image prompt (globalStylePrompt already prepended by caller)
   * @param caseId       Used as cache namespace
   * @param entityType   'suspect' | 'location' | 'clue'
   * @param entityId     Unique entity ID within the case
   */
  generateImage(
    prompt: string,
    caseId: string,
    entityType: string,
    entityId: string,
  ): Observable<string> {
    const sourcePromptHash = hashPrompt(`${SAFE_PROMPT_VERSION}:${prompt}`);
    const requestKey = `${caseId}:${entityType}:${entityId}:${sourcePromptHash}`;
    const existingRequest = this.inFlightImageRequests.get(requestKey);
    if (existingRequest) return existingRequest;

    let debugRequestId: string | null = null;

    const request$ = from(getCachedImage(caseId, entityType, entityId)).pipe(
      switchMap((cached: CachedImage | null) => {
        if (cached?.sourcePromptHash === sourcePromptHash) {
          debugRequestId = this.debug.beginImageRequest(caseId, entityType, entityId, prompt);
          return of(trackAndReturn(URL.createObjectURL(cached.blob))).pipe(
            map((url) => {
              if (debugRequestId) {
                this.debug.finishImageRequestSuccess(debugRequestId, 'cached', 'cache', url);
              }
              return url;
            }),
          );
        }

        debugRequestId = this.debug.beginImageRequest(caseId, entityType, entityId, prompt);

        return this.getSafePrompt(prompt, caseId, entityType, entityId).pipe(
          switchMap((safePrompt) => {
            if (debugRequestId) {
              this.debug.attachImageSafePrompt(debugRequestId, safePrompt);
            }
            const promptHash = hashPrompt(safePrompt);

            if (cached && cached.promptHash === promptHash) {
              if (debugRequestId) {
                this.debug.finishImageRequestSuccess(debugRequestId, 'cached', 'cache');
              }
              return of(trackAndReturn(URL.createObjectURL(cached.blob)));
            }

            const dims = DIMENSIONS[entityType] ?? { width: 512, height: 512 };
            if (debugRequestId) {
              this.debug.attachImageRequestPayload(debugRequestId, {
                prompt: safePrompt,
                width: dims.width,
                height: dims.height,
              });
            }

            return this.fetchFromWorker(safePrompt, entityType).pipe(
              switchMap((blob) =>
                from(
                  setCachedImage(caseId, entityType, entityId, {
                    blob,
                    promptHash,
                    sourcePromptHash,
                    createdAt: Date.now(),
                  }),
                ).pipe(
                  map(() => trackAndReturn(URL.createObjectURL(blob))),
                  map((url) => {
                    if (debugRequestId) {
                      this.debug.finishImageRequestSuccess(
                        debugRequestId,
                        'success',
                        'worker',
                        url,
                      );
                    }
                    return url;
                  }),
                ),
              ),
            );
          }),
        );
      }),
      catchError((error: Error) => {
        const fallbackUrl = this.buildCssPlaceholder(prompt);
        if (debugRequestId) {
          this.debug.finishImageRequestError(debugRequestId, error.message, fallbackUrl);
        }
        return of(fallbackUrl);
      }),
      finalize(() => this.inFlightImageRequests.delete(requestKey)),
      shareReplay(1),
    );

    this.inFlightImageRequests.set(requestKey, request$);
    return request$;
  }

  /**
   * Generate a CasePackage's images progressively — those `scope` allows (all
   * of them by default). Cached images resolve from IndexedDB without a call.
   * Emits an updated CasePackage snapshot after each image resolves.
   * Uses globalStylePrompt from visualDirection as a style prefix.
   */
  generateAllCaseImages(
    casePackage: CasePackage,
    scope: ImageScope = ALL_IMAGES,
  ): Observable<CasePackage> {
    return new Observable<CasePackage>((observer) => {
      let current = casePackage;
      const subscription = this.caseImageUpdates(casePackage, scope).subscribe({
        next: (apply) => {
          current = apply(current);
          observer.next(current);
        },
        error: (error) => observer.error(error),
        complete: () => observer.complete(),
      });
      return () => subscription.unsubscribe();
    });
  }

  /**
   * Like generateAllCaseImages, but emits each result as an update function
   * rather than a snapshot, so a caller can apply it to its latest package.
   * That keeps results from separate batches (one per clue found, say) from
   * overwriting each other.
   */
  caseImageUpdates(
    casePackage: CasePackage,
    scope: ImageScope = ALL_IMAGES,
  ): Observable<(pkg: CasePackage) => CasePackage> {
    const stylePrefix = casePackage.visualDirection?.globalStylePrompt ?? '';
    const prefix = stylePrefix ? stylePrefix + ', ' : '';
    const caseId = casePackage.id;

    type Task = {
      entityType: ImageEntityType;
      entityId: string;
      prompt: string;
      apply: (pkg: CasePackage, url: string) => CasePackage;
    };

    const tasks: Task[] = [
      // Briefing / hero image for the case introduction screen
      {
        entityType: 'case',
        entityId: casePackage.id,
        prompt:
          prefix +
          `cinematic establishing shot, ${casePackage.metadata.setting}, dramatic atmosphere, ${casePackage.visualDirection?.mood ?? 'mysterious'}, no people, wide angle`,
        apply: (pkg: CasePackage, url: string): CasePackage => ({
          ...pkg,
          briefingImageUrl: url,
        }),
      },
      // Act splash images — one per act, summarising what happens in that act
      ...(
        [
          {
            actKey: 'act1ImageUrl' as const,
            summary: casePackage.metadata.act1Summary,
            label: 'Act I',
          },
          {
            actKey: 'act2ImageUrl' as const,
            summary: casePackage.metadata.act2Summary,
            label: 'Act II',
          },
          {
            actKey: 'act3ImageUrl' as const,
            summary: casePackage.metadata.act3Summary,
            label: 'Act III',
          },
        ] as const
      ).map(({ actKey, summary, label }) => ({
        entityType: 'case' as const,
        entityId: `${casePackage.id}-${actKey}`,
        prompt:
          prefix +
          `detective mystery scene, ${label}, ${summary.slice(0, 120)}, ${casePackage.metadata.setting}, cinematic, atmospheric, no text`,
        apply: (pkg: CasePackage, url: string): CasePackage => ({
          ...pkg,
          [actKey]: url,
        }),
      })),
      ...casePackage.suspects.map((s) => ({
        entityType: 'suspect' as const,
        entityId: s.id,
        prompt: prefix + s.imagePrompt,
        apply: (pkg: CasePackage, url: string): CasePackage => ({
          ...pkg,
          suspects: pkg.suspects.map((x) => (x.id === s.id ? { ...x, imageUrl: url } : x)),
        }),
      })),
      ...casePackage.locations.map((l) => ({
        entityType: 'location' as const,
        entityId: l.id,
        prompt: prefix + l.imagePrompt,
        apply: (pkg: CasePackage, url: string): CasePackage => ({
          ...pkg,
          locations: pkg.locations.map((x) => (x.id === l.id ? { ...x, imageUrl: url } : x)),
        }),
      })),
      ...casePackage.clues.map((c) => ({
        entityType: 'clue' as const,
        entityId: c.id,
        prompt: prefix + c.imagePrompt,
        apply: (pkg: CasePackage, url: string): CasePackage => ({
          ...pkg,
          clues: pkg.clues.map((x) => (x.id === c.id ? { ...x, imageUrl: url } : x)),
        }),
      })),
    ];

    return new Observable<(pkg: CasePackage) => CasePackage>((observer) => {
      const subscription = from(tasks.filter((t) => scope(t.entityType, t.entityId)))
        .pipe(
          mergeMap(
            (task) =>
              this.generateImage(task.prompt, caseId, task.entityType, task.entityId).pipe(
                catchError(() => of(this.buildCssPlaceholder(task.prompt))),
                map((url) => ({ task, url })),
              ),
            IMAGE_BATCH_CONCURRENCY,
          ),
        )
        .subscribe({
          next: ({ task, url }) => observer.next((pkg) => task.apply(pkg, url)),
          error: (error) => observer.error(error),
          complete: () => observer.complete(),
        });

      return () => subscription.unsubscribe();
    });
  }

  private getSafePrompt(
    originalPrompt: string,
    caseId: string,
    entityType: string,
    entityId: string,
  ): Observable<string> {
    const cacheKey = hashPrompt(`${SAFE_PROMPT_VERSION}:${originalPrompt}`);
    const cachedPrompt = this.safePromptCache.get(cacheKey);
    if (cachedPrompt) return cachedPrompt;

    const prompt$ = this.llm
      .createSafeImagePrompt(originalPrompt, {
        label: `Image Safe Prompt: ${entityType}/${entityId}`,
        category: 'image-safe-prompt',
        caseId,
        entityType,
        entityId,
      })
      .pipe(map((safePrompt) => this.normalizeSafePrompt(originalPrompt, safePrompt)))
      .pipe(shareReplay(1));
    this.safePromptCache.set(cacheKey, prompt$);
    return prompt$;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private fetchFromWorker(prompt: string, entityType: string): Observable<Blob> {
    const dims = DIMENSIONS[entityType] ?? { width: 512, height: 512 };
    return from(
      fetch(environment.imageWorkerEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, width: dims.width, height: dims.height }),
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Worker error: ${res.status} ${body}`);
        }
        return res.blob();
      }),
    );
  }

  private buildCssPlaceholder(hint: string): string {
    const label = hint.slice(0, 32).replace(/[<>&"]/g, '');
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" fill="#1a1a2e"/>
  <rect x="1" y="1" width="510" height="510" fill="none" stroke="#c9a84c" stroke-width="2" stroke-dasharray="8 4"/>
  <text x="256" y="240" font-family="serif" font-size="18" fill="#c9a84c" text-anchor="middle">[ Image Unavailable ]</text>
  <text x="256" y="272" font-family="serif" font-size="12" fill="#888" text-anchor="middle">${label}</text>
</svg>`.trim();
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  private normalizeSafePrompt(originalPrompt: string, safePrompt: string): string {
    const cleanedPrompt = safePrompt.trim().replace(/^['\"]|['\"]$/g, '');
    const candidate = cleanedPrompt.length > 0 ? cleanedPrompt : originalPrompt;
    return this.scrubSpecificIdentifiers(candidate, originalPrompt)
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private scrubSpecificIdentifiers(prompt: string, originalPrompt: string): string {
    const terms = this.extractSensitiveTerms(originalPrompt);
    let sanitized = prompt;

    for (const term of terms) {
      sanitized = sanitized.replace(this.toWholeWordRegex(term), 'an unnamed subject');
    }

    return sanitized;
  }

  private extractSensitiveTerms(originalPrompt: string): string[] {
    const quotedTerms = Array.from(
      originalPrompt.matchAll(/["']([^"']{2,})["']/g),
      (match) => match[1],
    );
    const capitalizedPhrases = Array.from(
      originalPrompt.matchAll(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g),
      (match) => match[0],
    ).filter((term) => !this.isAllowedDescriptor(term));

    return [...new Set([...quotedTerms, ...capitalizedPhrases])].sort(
      (left, right) => right.length - left.length,
    );
  }

  private isAllowedDescriptor(term: string): boolean {
    return [
      'A',
      'An',
      'The',
      'Detective',
      'Mystery',
      'Noir',
      'Cinematic',
      'Dramatic',
      'Atmospheric',
      'Portrait',
      'Wide',
      'Close',
      'Medium',
    ].includes(term);
  }

  private toWholeWordRegex(value: string): RegExp {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'gi');
  }
}
