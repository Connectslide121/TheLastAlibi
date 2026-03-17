import { Injectable, signal } from '@angular/core';
import { Observable, from } from 'rxjs';
import { environment } from '../../environments/environment';
import { getCachedNarration, setCachedNarration, CachedNarration } from '../utils/tts-cache';

export type TtsSpeaker =
  | 'zeus'
  | 'asteria'
  | 'luna'
  | 'stella'
  | 'athena'
  | 'hera'
  | 'orion'
  | 'arcas';

export interface TtsNarrationItem {
  key: string;
  text: string;
  speaker?: TtsSpeaker;
}

@Injectable({ providedIn: 'root' })
export class TtsService {
  /** True while audio is being fetched or played. */
  readonly isPlaying = signal(false);

  private currentAudio: HTMLAudioElement | null = null;

  // ---------------------------------------------------------------------------
  // Pre-generation (called during case creation)
  // ---------------------------------------------------------------------------

  /**
   * Fetch TTS audio for each narration item and store in IndexedDB.
   * Errors are silently swallowed — TTS is non-critical.
   * Returns an Observable of each resolved item (completes when all done).
   */
  preGenerateNarrations(caseId: string, items: TtsNarrationItem[]): Observable<void> {
    return from(this.doPreGenerate(caseId, items));
  }

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  /**
   * Play a narration for the given caseId + key.
   * Tries the IndexedDB cache first; falls back to a live API call if not cached.
   * Errors are silently swallowed.
   */
  playNarration(
    caseId: string,
    key: string,
    text: string,
    speaker: TtsSpeaker = 'zeus',
  ): Observable<void> {
    return from(this.doPlayNarration(caseId, key, text, speaker));
  }

  /**
   * Fetch TTS audio for `text` and play it immediately (no caching).
   * Returns an Observable that completes when playback ends (or errors silently).
   * Calling this while audio is already playing stops the current audio first.
   */
  speak(text: string, speaker: TtsSpeaker = 'zeus'): Observable<void> {
    return from(this.doSpeak(text, speaker));
  }

  /** Stop any currently playing TTS audio. */
  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.src = '';
      this.currentAudio = null;
    }
    this.isPlaying.set(false);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async doPreGenerate(caseId: string, items: TtsNarrationItem[]): Promise<void> {
    await Promise.all(
      items.map(async ({ key, text, speaker = 'zeus' }) => {
        try {
          // Skip if already cached
          const existing = await getCachedNarration(caseId, key);
          if (existing) return;

          const blob = await this.fetchAudioBlob(text, speaker);
          if (!blob) return;

          const entry: CachedNarration = { blob, createdAt: Date.now() };
          await setCachedNarration(caseId, key, entry);
        } catch {
          // Non-critical — continue silently
        }
      }),
    );
  }

  private async doPlayNarration(
    caseId: string,
    key: string,
    text: string,
    speaker: TtsSpeaker,
  ): Promise<void> {
    this.stop();
    this.isPlaying.set(true);

    try {
      // Try cache first
      let blob: Blob | null = null;
      try {
        const cached = await getCachedNarration(caseId, key);
        if (cached) blob = cached.blob;
      } catch {
        // Cache miss — fall through to live fetch
      }

      if (!blob) {
        blob = await this.fetchAudioBlob(text, speaker);
      }

      if (!blob) {
        this.isPlaying.set(false);
        return;
      }

      await this.playBlob(blob);
    } catch {
      this.isPlaying.set(false);
    }
  }

  private async doSpeak(text: string, speaker: TtsSpeaker): Promise<void> {
    this.stop();
    this.isPlaying.set(true);

    try {
      const blob = await this.fetchAudioBlob(text, speaker);
      if (!blob) {
        this.isPlaying.set(false);
        return;
      }
      await this.playBlob(blob);
    } catch {
      this.isPlaying.set(false);
    }
  }

  private async fetchAudioBlob(text: string, speaker: TtsSpeaker): Promise<Blob | null> {
    try {
      const response = await fetch(environment.ttsWorkerEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, speaker, encoding: 'mp3' }),
      });
      if (!response.ok) return null;
      return await response.blob();
    } catch {
      return null;
    }
  }

  private async playBlob(blob: Blob): Promise<void> {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    this.currentAudio = audio;

    await new Promise<void>((resolve) => {
      audio.onended = () => {
        URL.revokeObjectURL(url);
        this.currentAudio = null;
        this.isPlaying.set(false);
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        this.currentAudio = null;
        this.isPlaying.set(false);
        resolve();
      };
      audio.play().catch(() => {
        URL.revokeObjectURL(url);
        this.currentAudio = null;
        this.isPlaying.set(false);
        resolve();
      });
    });
  }
}
