import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable } from 'rxjs';
import { WorkerLlmService } from './worker-llm';
import { CasePackage, Suspect, Clue } from '../models';

export interface InterviewChatMessage {
  role: 'detective' | 'suspect';
  text: string;
}

export interface InterviewSecret {
  key: string;
  label: string;
  required: boolean;
  revealed: boolean;
}

interface LlmInterviewPayload {
  response: string;
  revealedKeys: string[];
  suggestedQuestions: string[];
}

@Injectable({ providedIn: 'root' })
export class InterviewService {
  private readonly workerLlm = inject(WorkerLlmService);

  static readonly MAX_EXCHANGES = 10;

  readonly chatHistory = signal<InterviewChatMessage[]>([]);
  readonly suggestedQuestions = signal<string[]>([]);
  readonly secrets = signal<InterviewSecret[]>([]);
  readonly isLoading = signal(false);
  readonly isComplete = signal(false);
  readonly pendingCompletion = signal(false);
  readonly exchangeCount = signal(0);

  readonly revealedCount = computed(() => this.secrets().filter((s) => s.revealed).length);
  readonly totalCount = computed(() => this.secrets().length);
  readonly allRequiredRevealed = computed(() =>
    this.secrets().filter((s) => s.required).every((s) => s.revealed),
  );

  private systemPrompt = '';
  private suspectName = '';
  private currentSessionId = '';
  private currentSuspectId = '';

  startSession(suspect: Suspect, pkg: CasePackage, foundClues: Clue[], sessionId: string): void {
    this.suspectName = suspect.name;
    this.currentSessionId = sessionId;
    this.currentSuspectId = suspect.id;
    this.isComplete.set(false);
    this.pendingCompletion.set(false);
    this.exchangeCount.set(0);
    this.isLoading.set(false);

    // Build the list of secrets the detective can uncover
    const secrets: InterviewSecret[] = [
      { key: 'alibi', label: 'Alibi confirmed', required: true, revealed: false },
    ];
    if (suspect.isHidingSecret) {
      secrets.push({
        key: 'hidden_secret',
        label: 'Personal secret revealed',
        required: false,
        revealed: false,
      });
    }
    if (suspect.isLying) {
      secrets.push({
        key: 'contradiction',
        label: 'Lie exposed',
        required: false,
        revealed: false,
      });
    }
    this.secrets.set(secrets);

    this.systemPrompt = this.buildSystemPrompt(suspect, pkg, foundClues);

    // Opening line from the suspect (static, based on personality)
    this.chatHistory.set([{ role: 'suspect', text: this.buildOpeningLine(suspect) }]);

    // Seed the suggested questions with sensible openers
    this.suggestedQuestions.set([
      'Where were you when the incident occurred? Can anyone vouch for you?',
      'How well did you know the victim? Describe your relationship.',
      "Is there anything about that day or evening you haven't told the authorities?",
    ]);
  }

  sendMessage(text: string): Observable<void> {
    this.chatHistory.update((h) => [...h, { role: 'detective', text }]);
    this.isLoading.set(true);
    this.exchangeCount.update((c) => c + 1);
    const exchangeNum = this.exchangeCount();

    const conversationStr = this.chatHistory()
      .map((m) =>
        m.role === 'detective' ? `DETECTIVE: ${m.text}` : `${this.suspectName}: ${m.text}`,
      )
      .join('\n');

    const prompt =
      `${conversationStr}\n` +
      `[Exchange ${exchangeNum} of ${InterviewService.MAX_EXCHANGES}]\n` +
      `Respond now as ${this.suspectName}. Return ONLY valid JSON, no other text:`;

    return new Observable<void>((observer) => {
      this.workerLlm
        .generateText({
          systemPrompt: this.systemPrompt,
          prompt,
          maxTokens: 500,
          temperature: 0.85,
        })
        .subscribe({
          next: (raw) => {
            const parsed = this.parseResponse(raw);
            this.chatHistory.update((h) => [...h, { role: 'suspect', text: parsed.response }]);

            if (parsed.suggestedQuestions.length > 0) {
              this.suggestedQuestions.set(parsed.suggestedQuestions.slice(0, 3));
            }

            if (parsed.revealedKeys.length > 0) {
              this.secrets.update((ss) =>
                ss.map((s) =>
                  parsed.revealedKeys.includes(s.key) ? { ...s, revealed: true } : s,
                ),
              );
            }

            this.isLoading.set(false);
            this.checkCompletion(exchangeNum);
            observer.next();
            observer.complete();
          },
          error: () => {
            this.chatHistory.update((h) => [
              ...h,
              { role: 'suspect', text: '… (the suspect seems distracted and does not respond)' },
            ]);
            this.isLoading.set(false);
            observer.next();
            observer.complete();
          },
        });
    });
  }

  endSession(): void {
    this.saveTranscript();
    this.isComplete.set(true);
  }

  proceedToSummary(): void {
    this.saveTranscript();
    this.pendingCompletion.set(false);
    this.isComplete.set(true);
  }

  loadTranscript(messages: InterviewChatMessage[]): void {
    this.chatHistory.set(messages);
    this.suggestedQuestions.set([]);
    this.secrets.set([]);
    this.isLoading.set(false);
    this.isComplete.set(false);
    this.pendingCompletion.set(false);
    this.exchangeCount.set(0);
  }

  getStoredTranscript(sessionId: string, suspectId: string): InterviewChatMessage[] | null {
    try {
      const key = `tla_interview_${sessionId}_${suspectId}`;
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as InterviewChatMessage[];
    } catch {
      // ignore storage errors
    }
    return null;
  }

  private checkCompletion(exchangeNum: number): void {
    if (exchangeNum >= InterviewService.MAX_EXCHANGES || this.allRequiredRevealed()) {
      setTimeout(() => this.pendingCompletion.set(true), 1200);
    }
  }

  private saveTranscript(): void {
    if (!this.currentSessionId || !this.currentSuspectId) return;
    try {
      const key = `tla_interview_${this.currentSessionId}_${this.currentSuspectId}`;
      localStorage.setItem(key, JSON.stringify(this.chatHistory()));
    } catch {
      // localStorage writes are non-fatal
    }
  }

  private buildOpeningLine(suspect: Suspect): string {
    const p = suspect.personality.toLowerCase();
    if (p.includes('nervous') || p.includes('anxious') || p.includes('jumpy')) {
      return `Oh — Detective. I've been expecting someone to come by. I'm not quite sure what more I can tell you, but I'll try my best.`;
    }
    if (p.includes('arrogant') || p.includes('cold') || p.includes('dismissive')) {
      return `Detective. I'll give you a few minutes, though I assure you there's very little I can add to what has already been said.`;
    }
    if (
      p.includes('friendly') ||
      p.includes('warm') ||
      p.includes('charming') ||
      p.includes('sociable')
    ) {
      return `Detective, please come in. I want to help however I can — this whole situation has been dreadful. What would you like to know?`;
    }
    if (p.includes('guarded') || p.includes('suspicious') || p.includes('paranoid')) {
      return `…I wasn't sure you'd come to me. What is it you want to know, exactly?`;
    }
    return `Detective. I was told you had questions. I'll answer what I can, though I'm not sure I know anything useful.`;
  }

  private buildSystemPrompt(suspect: Suspect, pkg: CasePackage, foundClues: Clue[]): string {
    const truth = pkg.truth;
    const isCulprit = truth.culpritId === suspect.id;

    const foundCluesSummary =
      foundClues.length > 0
        ? foundClues.map((c) => `- ${c.name}: ${c.revealsInfo}`).join('\n')
        : 'None yet.';

    let situationBlock: string;
    if (isCulprit) {
      situationBlock =
        `You ARE the culprit. You committed this crime.\n` +
        `Your motive: "${truth.motive}".\n` +
        `Your method: "${truth.method}".\n` +
        `You will not confess under any circumstances. You appear cooperative but are deeply anxious. ` +
        `When pressed on contradictions, become visibly nervous, deflect, or change the subject. Never confirm your guilt directly.`;
    } else if (suspect.isLying) {
      situationBlock =
        `You are NOT the culprit, but you are lying about something related to the case.\n` +
        `The key contradiction in your story: "${truth.keyContradiction}".\n` +
        `Only admit this contradiction (use "contradiction" in revealedKeys) when the detective ` +
        `directly confronts you or presents contradicting evidence. Do not volunteer it.`;
    } else if (suspect.isMistaken) {
      situationBlock =
        `You are innocent, but one aspect of your account is factually wrong — ` +
        `you genuinely believe what you're saying, even though part of it is mistaken.\n` +
        `Your mistaken belief relates to: "${truth.keyContradiction}".`;
    } else {
      situationBlock =
        `You are innocent and genuinely want to help the detective find the truth. ` +
        `You may have your own worries, but you are not directly involved in the crime.`;
    }

    const hiddenBlock = suspect.isHidingSecret
      ? `\nPERSONAL SECRET (only disclose after DIRECT and persistent questioning): "${suspect.secretUnrelatedToCase}"\n` +
        `Use "hidden_secret" in revealedKeys ONLY if the detective presses you on your personal life or explicitly corners you on this topic.`
      : '';

    const secretKeys = ['alibi'];
    if (suspect.isHidingSecret) secretKeys.push('hidden_secret');
    if (suspect.isLying) secretKeys.push('contradiction');

    return (
      `You are ${suspect.name} in a detective mystery game. A detective is interviewing you. ` +
      `Stay completely in character. Never acknowledge the game or break the fourth wall.\n\n` +
      `CHARACTER:\n` +
      `- Name: ${suspect.name}, age ${suspect.age}, ${suspect.occupation}\n` +
      `- Relationship to case: ${suspect.relationship}\n` +
      `- Appearance: ${suspect.description}\n` +
      `- Personality: ${suspect.personality}\n\n` +
      `CASE SETTING: ${pkg.metadata.setting}\n` +
      `CASE BACKGROUND: ${pkg.metadata.briefing}\n\n` +
      `YOUR SITUATION:\n${situationBlock}\n` +
      hiddenBlock +
      `\n\nYOUR ALIBI: "${suspect.alibi}"\n` +
      `State this alibi (include "alibi" in revealedKeys) when asked directly about your whereabouts.\n\n` +
      `EVIDENCE THE DETECTIVE CURRENTLY HAS:\n${foundCluesSummary}\n\n` +
      `RESPONSE FORMAT — respond ONLY with valid JSON, nothing before or after:\n` +
      `{"response": "your 2–4 sentence in-character reply", "revealedKeys": [one or more of: ${secretKeys.map((k) => `"${k}"`).join(', ')}], "suggestedQuestions": ["follow-up 1", "follow-up 2", "follow-up 3"]}\n\n` +
      `BEHAVIOR RULES:\n` +
      `- Keep responses SHORT: 2–4 sentences. Never write monologues.\n` +
      `- Match your personality at all times: ${suspect.personality}\n` +
      `- Be evasive about hidden things — deflect, show emotion, change subject, but don't bluntly lie\n` +
      `- Occasionally turn a question back on the detective\n` +
      `- suggestedQuestions: suggest 3 natural follow-up questions the detective might ask, nudging them toward important topics\n` +
      `- When near exchange ${InterviewService.MAX_EXCHANGES}, start naturally winding down the conversation`
    );
  }

  private parseResponse(raw: string): LlmInterviewPayload {
    const cleaned = raw.trim().replace(/<think>[\s\S]*?<\/think>\s*/gi, '');

    // Attempt 1: direct JSON parse
    try {
      const p = JSON.parse(cleaned) as LlmInterviewPayload;
      if (typeof p.response === 'string') {
        return {
          response: p.response,
          revealedKeys: Array.isArray(p.revealedKeys) ? (p.revealedKeys as string[]) : [],
          suggestedQuestions: Array.isArray(p.suggestedQuestions)
            ? (p.suggestedQuestions as string[])
            : [],
        };
      }
    } catch {
      // fall through to extraction
    }

    // Attempt 2: find the first JSON-like object containing a "response" key
    const jsonMatch = cleaned.match(/\{[\s\S]*?"response"\s*:\s*"[\s\S]*?"[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const p = JSON.parse(jsonMatch[0]) as LlmInterviewPayload;
        if (typeof p.response === 'string') {
          return {
            response: p.response,
            revealedKeys: Array.isArray(p.revealedKeys) ? (p.revealedKeys as string[]) : [],
            suggestedQuestions: Array.isArray(p.suggestedQuestions)
              ? (p.suggestedQuestions as string[])
              : [],
          };
        }
      } catch {
        // fall through to fallback
      }
    }

    // Fallback: treat the entire raw text as the spoken response
    return {
      response: cleaned.length > 0 ? cleaned : '… (the suspect says nothing)',
      revealedKeys: [],
      suggestedQuestions: [],
    };
  }
}
