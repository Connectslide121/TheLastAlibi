import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';

import { environment } from '../../environments/environment';

export interface WorkerGenerationOptions {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

interface WorkerTextResponse {
  text?: unknown;
  raw?: unknown;
}

const DEFAULT_TEXT_OPTIONS = {
  maxTokens: 1500,
  temperature: 0.7,
};

const DEFAULT_PUZZLE_OPTIONS = {
  maxTokens: 4000,
  temperature: 0.4,
};

@Injectable({ providedIn: 'root' })
export class WorkerLlmService {
  generateText(options: WorkerGenerationOptions): Observable<string> {
    return from(this.postForText('/text', options, DEFAULT_TEXT_OPTIONS));
  }

  generatePuzzle(options: WorkerGenerationOptions): Observable<string> {
    return from(this.postForText('/puzzle', options, DEFAULT_PUZZLE_OPTIONS));
  }

  private async postForText(
    path: '/text' | '/puzzle',
    options: WorkerGenerationOptions,
    defaults: { maxTokens: number; temperature: number },
  ): Promise<string> {
    const response = await fetch(this.buildUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: options.prompt,
        systemPrompt: options.systemPrompt,
        maxTokens: options.maxTokens ?? defaults.maxTokens,
        temperature: options.temperature ?? defaults.temperature,
      }),
    });

    const bodyText = await response.text().catch(() => '');

    if (!response.ok) {
      throw new Error(
        `Worker ${path} failed with status ${response.status}${bodyText ? `: ${bodyText}` : ''}`,
      );
    }

    let parsed: WorkerTextResponse;
    try {
      parsed = JSON.parse(bodyText) as WorkerTextResponse;
    } catch {
      throw new Error(
        `Worker ${path} returned invalid JSON${bodyText ? `: ${bodyText.slice(0, 300)}` : ''}`,
      );
    }

    if (typeof parsed.text !== 'string' || parsed.text.trim().length === 0) {
      throw new Error(`Worker ${path} response did not include a valid text field`);
    }

    return parsed.text.trim();
  }

  private buildUrl(path: '/text' | '/puzzle'): string {
    return `${environment.workerBaseUrl.replace(/\/+$/, '')}${path}`;
  }
}
