import { Injectable, computed, signal } from '@angular/core';

export type DebugRequestStatus = 'pending' | 'success' | 'error';
export type DebugImageStatus = 'pending' | 'success' | 'error' | 'cached';

export interface DebugRequestMeta {
  label: string;
  category:
    | 'case-foundation'
    | 'suspects'
    | 'locations'
    | 'clues'
    | 'timeline'
    | 'event-graph'
    | 'puzzle-concept'
    | 'puzzle-html'
    | 'hint-ladder'
    | 'visual-theme'
    | 'image-safe-prompt'
    | 'other';
  caseId?: string;
  puzzleId?: string;
  puzzleLabel?: string;
  entityType?: string;
  entityId?: string;
}

export interface DebugAiRequestPayload {
  prompt: string;
  systemPrompt?: string;
  maxTokens: number;
  temperature: number;
}

export interface DebugAiRequestRecord {
  id: string;
  startedAt: string;
  completedAt?: string;
  path: '/text' | '/puzzle';
  status: DebugRequestStatus;
  payload: DebugAiRequestPayload;
  responseBody?: string;
  responseText?: string;
  error?: string;
  meta?: DebugRequestMeta;
}

export interface DebugImageRequestPayload {
  prompt: string;
  width: number;
  height: number;
}

export interface DebugImageRecord {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: DebugImageStatus;
  caseId: string;
  entityType: string;
  entityId: string;
  originalPrompt: string;
  safePrompt?: string;
  requestPayload?: DebugImageRequestPayload;
  outputUrl?: string;
  outputKind?: 'worker' | 'cache' | 'placeholder';
  error?: string;
}

const MAX_DEBUG_RECORDS = 400;
const DEBUG_TRACE_STORAGE_KEY = 'tla_debug_trace';

type PersistedDebugTrace = {
  aiRequests: DebugAiRequestRecord[];
  imageRequests: DebugImageRecord[];
};

export type DebugTraceSnapshot = PersistedDebugTrace;

function trimToLimit<T>(items: T[]): T[] {
  return items.length <= MAX_DEBUG_RECORDS ? items : items.slice(items.length - MAX_DEBUG_RECORDS);
}

function sameImageJob(
  record: DebugImageRecord,
  caseId: string,
  entityType: string,
  entityId: string,
  originalPrompt: string,
): boolean {
  return (
    record.caseId === caseId &&
    record.entityType === entityType &&
    record.entityId === entityId &&
    record.originalPrompt === originalPrompt
  );
}

@Injectable({ providedIn: 'root' })
export class DebugTraceService {
  private readonly initialState = this.readPersistedState();
  private readonly _aiRequests = signal<DebugAiRequestRecord[]>(this.initialState.aiRequests);
  private readonly _imageRequests = signal<DebugImageRecord[]>(this.initialState.imageRequests);

  readonly aiRequests = this._aiRequests.asReadonly();
  readonly imageRequests = this._imageRequests.asReadonly();
  readonly requestCount = computed(() => this._aiRequests().length);
  readonly imageCount = computed(() => this._imageRequests().length);

  snapshot(): DebugTraceSnapshot {
    return {
      aiRequests: [...this._aiRequests()],
      imageRequests: [...this._imageRequests()],
    };
  }

  loadSnapshot(snapshot: DebugTraceSnapshot | null | undefined): void {
    if (!snapshot) return;
    this._aiRequests.set(Array.isArray(snapshot.aiRequests) ? snapshot.aiRequests : []);
    this._imageRequests.set(Array.isArray(snapshot.imageRequests) ? snapshot.imageRequests : []);
    this.persist();
  }

  resetRun(): void {
    this._aiRequests.set([]);
    this._imageRequests.set([]);
    this.persist();
  }

  beginAiRequest(
    path: '/text' | '/puzzle',
    payload: DebugAiRequestPayload,
    meta?: DebugRequestMeta,
  ): string {
    const id = crypto.randomUUID();
    const record: DebugAiRequestRecord = {
      id,
      startedAt: new Date().toISOString(),
      path,
      status: 'pending',
      payload,
      meta,
    };
    this._aiRequests.update((records) => trimToLimit([...records, record]));
    this.persist();
    return id;
  }

  finishAiRequestSuccess(id: string, responseBody: string, responseText: string): void {
    this._aiRequests.update((records) =>
      records.map((record) =>
        record.id === id
          ? {
              ...record,
              completedAt: new Date().toISOString(),
              status: 'success',
              responseBody,
              responseText,
            }
          : record,
      ),
    );
    this.persist();
  }

  finishAiRequestError(id: string, error: string, responseBody?: string): void {
    this._aiRequests.update((records) =>
      records.map((record) =>
        record.id === id
          ? {
              ...record,
              completedAt: new Date().toISOString(),
              status: 'error',
              error,
              responseBody: responseBody ?? record.responseBody,
            }
          : record,
      ),
    );
    this.persist();
  }

  beginImageRequest(
    caseId: string,
    entityType: string,
    entityId: string,
    originalPrompt: string,
  ): string {
    const existing = this._imageRequests().find((record) =>
      sameImageJob(record, caseId, entityType, entityId, originalPrompt),
    );

    const id = existing?.id ?? crypto.randomUUID();
    const record: DebugImageRecord = {
      id,
      startedAt: new Date().toISOString(),
      completedAt: undefined,
      status: 'pending',
      caseId,
      entityType,
      entityId,
      originalPrompt,
      safePrompt: existing?.safePrompt,
      requestPayload: existing?.requestPayload,
      outputUrl: existing?.outputUrl,
      outputKind: existing?.outputKind,
      error: undefined,
    };

    this._imageRequests.update((records) => {
      const next = existing
        ? records.map((current) => (current.id === id ? record : current))
        : [...records, record];
      return trimToLimit(next);
    });
    this.persist();
    return id;
  }

  attachImageSafePrompt(id: string, safePrompt: string): void {
    this._imageRequests.update((records) =>
      records.map((record) => (record.id === id ? { ...record, safePrompt } : record)),
    );
    this.persist();
  }

  attachImageRequestPayload(id: string, requestPayload: DebugImageRequestPayload): void {
    this._imageRequests.update((records) =>
      records.map((record) => (record.id === id ? { ...record, requestPayload } : record)),
    );
    this.persist();
  }

  finishImageRequestSuccess(
    id: string,
    status: Exclude<DebugImageStatus, 'pending' | 'error'>,
    outputKind: 'worker' | 'cache',
    outputUrl?: string,
  ): void {
    this._imageRequests.update((records) =>
      records.map((record) =>
        record.id === id
          ? {
              ...record,
              completedAt: new Date().toISOString(),
              status,
              outputKind,
              outputUrl,
            }
          : record,
      ),
    );
    this.persist();
  }

  finishImageRequestError(id: string, error: string, outputUrl?: string): void {
    this._imageRequests.update((records) =>
      records.map((record) =>
        record.id === id
          ? {
              ...record,
              completedAt: new Date().toISOString(),
              status: 'error',
              outputKind: outputUrl ? 'placeholder' : record.outputKind,
              outputUrl: outputUrl ?? record.outputUrl,
              error,
            }
          : record,
      ),
    );
    this.persist();
  }

  private persist(): void {
    if (typeof sessionStorage === 'undefined') return;
    const payload: PersistedDebugTrace = {
      aiRequests: this._aiRequests(),
      imageRequests: this._imageRequests(),
    };
    sessionStorage.setItem(DEBUG_TRACE_STORAGE_KEY, JSON.stringify(payload));
  }

  private readPersistedState(): PersistedDebugTrace {
    if (typeof sessionStorage === 'undefined') {
      return { aiRequests: [], imageRequests: [] };
    }

    const raw = sessionStorage.getItem(DEBUG_TRACE_STORAGE_KEY);
    if (!raw) {
      return { aiRequests: [], imageRequests: [] };
    }

    try {
      const parsed = JSON.parse(raw) as Partial<PersistedDebugTrace>;
      return {
        aiRequests: Array.isArray(parsed.aiRequests) ? parsed.aiRequests : [],
        imageRequests: Array.isArray(parsed.imageRequests) ? parsed.imageRequests : [],
      };
    } catch {
      return { aiRequests: [], imageRequests: [] };
    }
  }
}
