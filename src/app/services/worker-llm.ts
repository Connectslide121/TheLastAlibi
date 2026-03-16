import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';

import { environment } from '../../environments/environment';
import { DebugRequestMeta, DebugTraceService } from './debug-trace.service';

export interface WorkerGenerationOptions {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  debugMeta?: DebugRequestMeta;
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
  private readonly debug = inject(DebugTraceService);

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
    const payload = {
      prompt: options.prompt,
      systemPrompt: options.systemPrompt,
      maxTokens: options.maxTokens ?? defaults.maxTokens,
      temperature: options.temperature ?? defaults.temperature,
    };
    const requestId = this.debug.beginAiRequest(path, payload, options.debugMeta);

    try {
      const response = await fetch(this.buildUrl(path), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const bodyText = await response.text().catch(() => '');

      if (!response.ok) {
        const message = `Worker ${path} failed with status ${response.status}${bodyText ? `: ${bodyText}` : ''}`;
        this.debug.finishAiRequestError(requestId, message, bodyText);
        throw new Error(message);
      }

      let parsed: WorkerTextResponse;
      try {
        parsed = JSON.parse(bodyText) as WorkerTextResponse;
      } catch {
        const message = `Worker ${path} returned invalid JSON${bodyText ? `: ${bodyText.slice(0, 300)}` : ''}`;
        this.debug.finishAiRequestError(requestId, message, bodyText);
        throw new Error(message);
      }

      if (typeof parsed.text !== 'string' || parsed.text.trim().length === 0) {
        const message = `Worker ${path} response did not include a valid text field`;
        this.debug.finishAiRequestError(requestId, message, bodyText);
        throw new Error(message);
      }

      const responseText = parsed.text.trim().replace(/<think>[\s\S]*?<\/think>\s*/gi, '');
      this.debug.finishAiRequestSuccess(requestId, bodyText, responseText);
      return responseText;
    } catch (error) {
      if (error instanceof Error) {
        this.debug.finishAiRequestError(requestId, error.message);
      }
      throw error;
    }
  }

  private buildUrl(path: '/text' | '/puzzle'): string {
    return `${environment.workerBaseUrl.replace(/\/+$/, '')}${path}`;
  }
}
