import { Injectable, inject } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError, finalize, map, mergeMap, shareReplay, switchMap } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { CasePackage } from '../models';
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

const SAFE_PROMPT_VERSION = 'safe-prompt-v1';
const IMAGE_BATCH_CONCURRENCY = 3;

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly llm = inject(LlmService);
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

    const request$ = from(getCachedImage(caseId, entityType, entityId)).pipe(
      switchMap((cached: CachedImage | null) => {
        if (cached?.sourcePromptHash === sourcePromptHash) {
          return of(trackAndReturn(URL.createObjectURL(cached.blob)));
        }

        return this.getSafePrompt(prompt).pipe(
          switchMap((safePrompt) => {
            const promptHash = hashPrompt(safePrompt);

            if (cached && cached.promptHash === promptHash) {
              return of(trackAndReturn(URL.createObjectURL(cached.blob)));
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
                ).pipe(map(() => trackAndReturn(URL.createObjectURL(blob)))),
              ),
            );
          }),
        );
      }),
      catchError(() => of(this.buildCssPlaceholder(prompt))),
      finalize(() => this.inFlightImageRequests.delete(requestKey)),
      shareReplay(1),
    );

    this.inFlightImageRequests.set(requestKey, request$);
    return request$;
  }

  /**
   * Generate all images for a CasePackage progressively.
   * Emits an updated CasePackage snapshot after each image resolves.
   * Uses globalStylePrompt from visualDirection as a style prefix.
   */
  generateAllCaseImages(casePackage: CasePackage): Observable<CasePackage> {
    const stylePrefix = casePackage.visualDirection?.globalStylePrompt ?? '';
    const prefix = stylePrefix ? stylePrefix + ', ' : '';
    const caseId = casePackage.id;

    type Task = {
      entityType: string;
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
        entityType: 'case',
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
        entityType: 'suspect',
        entityId: s.id,
        prompt: prefix + s.imagePrompt,
        apply: (pkg: CasePackage, url: string): CasePackage => ({
          ...pkg,
          suspects: pkg.suspects.map((x) => (x.id === s.id ? { ...x, imageUrl: url } : x)),
        }),
      })),
      ...casePackage.locations.map((l) => ({
        entityType: 'location',
        entityId: l.id,
        prompt: prefix + l.imagePrompt,
        apply: (pkg: CasePackage, url: string): CasePackage => ({
          ...pkg,
          locations: pkg.locations.map((x) => (x.id === l.id ? { ...x, imageUrl: url } : x)),
        }),
      })),
      ...casePackage.clues.map((c) => ({
        entityType: 'clue',
        entityId: c.id,
        prompt: prefix + c.imagePrompt,
        apply: (pkg: CasePackage, url: string): CasePackage => ({
          ...pkg,
          clues: pkg.clues.map((x) => (x.id === c.id ? { ...x, imageUrl: url } : x)),
        }),
      })),
    ];

    return new Observable<CasePackage>((observer) => {
      let current = casePackage;
      const subscription = from(tasks)
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
          next: ({ task, url }) => {
            current = task.apply(current, url);
            observer.next(current);
          },
          error: (error) => observer.error(error),
          complete: () => observer.complete(),
        });

      return () => subscription.unsubscribe();
    });
  }

  private getSafePrompt(originalPrompt: string): Observable<string> {
    const cacheKey = hashPrompt(`${SAFE_PROMPT_VERSION}:${originalPrompt}`);
    const cachedPrompt = this.safePromptCache.get(cacheKey);
    if (cachedPrompt) return cachedPrompt;

    const prompt$ = this.llm.createSafeImagePrompt(originalPrompt).pipe(shareReplay(1));
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
}
