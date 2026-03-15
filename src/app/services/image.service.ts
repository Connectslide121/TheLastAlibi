import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, from, forkJoin } from 'rxjs';
import { catchError, map, switchMap, reduce } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { CasePackage, Suspect, Location, Clue } from '../models';

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly http = inject(HttpClient);

  /** Generate a single image and return a base64 data URL. */
  generateImage(prompt: string): Observable<string> {
    if (!environment.geminiApiKey) {
      return of(this.buildCssPlaceholder(prompt));
    }

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'x-goog-api-key': environment.geminiApiKey,
    });

    // Imagen 4 Fast via predict endpoint (requires paid Gemini API plan)
    const body = {
      instances: [{ prompt }],
      parameters: { sampleCount: 1 },
    };

    type ImagenResponse = { predictions: { bytesBase64Encoded: string; mimeType: string }[] };

    return this.http.post<ImagenResponse>(environment.imageApiEndpoint, body, { headers }).pipe(
      map((response) => {
        const prediction = response.predictions[0];
        return `data:${prediction.mimeType};base64,${prediction.bytesBase64Encoded}`;
      }),
      catchError(() => of(this.buildCssPlaceholder(prompt))),
    );
  }

  /**
   * Generate all images for a CasePackage progressively.
   * Images are fetched one at a time so gameplay can start as soon as the
   * first few are ready. Each call emits an updated CasePackage snapshot.
   */
  generateAllCaseImages(casePackage: CasePackage): Observable<CasePackage> {
    type Task = {
      key: string;
      prompt: string;
      apply: (pkg: CasePackage, url: string) => CasePackage;
    };

    const tasks: Task[] = [
      // Suspects
      ...casePackage.suspects.map((s) => ({
        key: `suspect-${s.id}`,
        prompt: s.imagePrompt,
        apply: (pkg: CasePackage, url: string): CasePackage => ({
          ...pkg,
          suspects: pkg.suspects.map((x) => (x.id === s.id ? { ...x, imageUrl: url } : x)),
        }),
      })),
      // Locations
      ...casePackage.locations.map((l) => ({
        key: `location-${l.id}`,
        prompt: l.imagePrompt,
        apply: (pkg: CasePackage, url: string): CasePackage => ({
          ...pkg,
          locations: pkg.locations.map((x) => (x.id === l.id ? { ...x, imageUrl: url } : x)),
        }),
      })),
      // Clues
      ...casePackage.clues.map((c) => ({
        key: `clue-${c.id}`,
        prompt: c.imagePrompt,
        apply: (pkg: CasePackage, url: string): CasePackage => ({
          ...pkg,
          clues: pkg.clues.map((x) => (x.id === c.id ? { ...x, imageUrl: url } : x)),
        }),
      })),
    ];

    // Chain tasks sequentially, emitting an updated package after each one
    return from(tasks).pipe(
      reduce(
        (acc$: Observable<CasePackage>, task) =>
          acc$.pipe(
            switchMap((pkg) =>
              this.generateImage(task.prompt).pipe(
                map((url) => task.apply(pkg, url)),
                catchError(() => of(pkg)), // skip on error, keep going
              ),
            ),
          ),
        of(casePackage),
      ),
      switchMap((result$) => result$),
    );
  }

  // ---------------------------------------------------------------------------
  // Private – CSS placeholder (data URI SVG) used when API is unavailable
  // ---------------------------------------------------------------------------

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
