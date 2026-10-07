import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable } from 'rxjs';
import { WorkerLlmService, isQuotaError } from './worker-llm';
import { CasePackage, Suspect, Clue } from '../models';

export interface InterviewChatMessage {
  role: 'detective' | 'suspect';
  text: string;
  /** System placeholder shown when the model call failed — never sent back to the model. */
  isError?: boolean;
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
    this.secrets()
      .filter((s) => s.required)
      .every((s) => s.revealed),
  );
  /** Nothing left to uncover — the detective may still keep talking. */
  readonly allRevealed = computed(() => this.secrets().every((s) => s.revealed));

  private systemPrompt = '';
  private suspectName = '';
  private currentSessionId = '';
  private transcriptKey = '';
  private questionPool: string[] = [];
  private askedQuestions = new Set<string>();

  /**
   * @param transcriptKey identifies this interview for storage — the event ID,
   *   so two interviews with the same suspect don't overwrite each other.
   */
  startSession(
    suspect: Suspect,
    pkg: CasePackage,
    foundClues: Clue[],
    sessionId: string,
    transcriptKey: string = suspect.id,
  ): void {
    this.suspectName = suspect.name;
    this.currentSessionId = sessionId;
    this.transcriptKey = transcriptKey;
    this.askedQuestions = new Set();
    this.questionPool = this.buildQuestionPool(suspect, pkg, foundClues);
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

    this.refreshSuggestions();
  }

  sendMessage(text: string): Observable<void> {
    if (this.exchangeCount() >= InterviewService.MAX_EXCHANGES || this.isLoading()) {
      return new Observable<void>((o) => o.complete());
    }
    this.askedQuestions.add(text.trim());
    this.chatHistory.update((h) => [...h, { role: 'detective', text }]);
    this.isLoading.set(true);
    this.exchangeCount.update((c) => c + 1);
    const exchangeNum = this.exchangeCount();

    const conversationStr = this.chatHistory()
      .filter((m) => !m.isError)
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
          maxTokens: 600,
          temperature: 0.85,
        })
        .subscribe({
          next: (raw) => {
            const parsed = this.parseResponse(raw);
            this.chatHistory.update((h) => [...h, { role: 'suspect', text: parsed.response }]);

            if (parsed.revealedKeys.length > 0) {
              this.secrets.update((ss) =>
                ss.map((s) => (parsed.revealedKeys.includes(s.key) ? { ...s, revealed: true } : s)),
              );
            }

            this.isLoading.set(false);
            this.refreshSuggestions();
            this.checkCompletion(exchangeNum);
            observer.next();
            observer.complete();
          },
          error: (err: unknown) => {
            const text = isQuotaError(err)
              ? "… (the suspect has gone quiet: today's free AI quota for this game has run out. It resets at midnight UTC.)"
              : '… (the suspect seems distracted and does not respond)';
            // A failed call doesn't use up one of the detective's exchanges.
            this.chatHistory.update((h) => [...h, { role: 'suspect', text, isError: true }]);
            this.exchangeCount.update((c) => Math.max(0, c - 1));
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

  /** Looks up by each key in turn (event ID first, then suspect ID for older saves). */
  getStoredTranscript(sessionId: string, ...keys: string[]): InterviewChatMessage[] | null {
    for (const k of keys) {
      try {
        const raw = localStorage.getItem(`tla_interview_${sessionId}_${k}`);
        if (raw) return JSON.parse(raw) as InterviewChatMessage[];
      } catch {
        // ignore storage errors
      }
    }
    return null;
  }

  /** Only the exchange limit ends the conversation; disclosures never cut it short. */
  private checkCompletion(exchangeNum: number): void {
    if (exchangeNum >= InterviewService.MAX_EXCHANGES) {
      setTimeout(() => this.pendingCompletion.set(true), 1200);
    }
  }

  private saveTranscript(): void {
    if (!this.currentSessionId || !this.transcriptKey) return;
    try {
      const key = `tla_interview_${this.currentSessionId}_${this.transcriptKey}`;
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

  /**
   * Suggested questions come from a neutral template, not from the model —
   * the model playing the suspect knows who did it and would steer the player.
   */
  private buildQuestionPool(suspect: Suspect, pkg: CasePackage, foundClues: Clue[]): string[] {
    const others = pkg.suspects.filter((s) => s.id !== suspect.id);
    return [
      'Where were you when it happened? Can anyone vouch for you?',
      'How well did you know the victim?',
      'Walk me through that day, from the start.',
      ...foundClues.slice(-4).map((c) => `What can you tell me about the ${c.name.toLowerCase()}?`),
      ...others.slice(0, 3).map((o) => `What do you make of ${o.name}?`),
      'Did you see or hear anything unusual?',
      "Is there anything you haven't told anyone yet?",
      'Who do you think had a reason to do this?',
    ];
  }

  private refreshSuggestions(): void {
    const alibiPending = this.secrets().some((s) => s.key === 'alibi' && !s.revealed);
    const pool = this.questionPool.filter((q) => !this.askedQuestions.has(q));
    // Keep the whereabouts question on offer until the alibi is on record.
    const ordered = alibiPending ? pool : pool.filter((q) => !q.startsWith('Where were you'));
    this.suggestedQuestions.set(ordered.slice(0, 3));
  }

  private buildSystemPrompt(suspect: Suspect, pkg: CasePackage, foundClues: Clue[]): string {
    const truth = pkg.truth;
    const isCulprit = truth.culpritId === suspect.id;

    // Names and descriptions only — revealsInfo is the detective's deduction and
    // would hand every suspect (including the culprit) the analysis.
    const foundCluesSummary =
      foundClues.length > 0
        ? foundClues.map((c) => `- ${c.name}: ${c.description}`).join('\n')
        : 'None yet.';

    let situationBlock: string;
    if (isCulprit) {
      situationBlock =
        `You ARE the culprit. You committed this crime.\n` +
        `Your motive: "${truth.motive}".\n` +
        `Your method: "${truth.method}".\n` +
        `What really happened (never admit it): "${suspect.trueWhereabouts || truth.trueTimeline}".\n` +
        `Your alibi below is a lie. Keep it consistent; when confronted with evidence that ` +
        `contradicts it, get nervous, deflect, or offer a weak explanation — that is when you use ` +
        `"contradiction" in revealedKeys. Never confess or confirm your guilt directly.`;
    } else if (suspect.isLying) {
      situationBlock =
        `You are NOT the culprit, but you are lying about something of your own: ` +
        `"${suspect.lieAbout || 'you were not quite where you claim to have been, for embarrassing personal reasons'}".\n` +
        (suspect.trueWhereabouts ? `What you really did: "${suspect.trueWhereabouts}".\n` : '') +
        `Only admit the lie (use "contradiction" in revealedKeys) when the detective directly ` +
        `confronts you or presents contradicting evidence. Do not volunteer it.`;
    } else if (suspect.isMistaken) {
      situationBlock =
        `You are innocent, but one detail of your account is wrong — you genuinely believe it.\n` +
        `Your mistaken belief: "${suspect.mistakenBelief || 'you are slightly wrong about the time you saw someone'}".` +
        (suspect.trueWhereabouts ? `\nWhat you really did: "${suspect.trueWhereabouts}".` : '');
    } else {
      situationBlock =
        `You are innocent and genuinely want to help the detective find the truth. ` +
        `You may have your own worries, but you are not involved in the crime.` +
        (suspect.trueWhereabouts ? `\nWhat you did: "${suspect.trueWhereabouts}".` : '');
    }

    const hiddenBlock = suspect.isHidingSecret
      ? `\nPERSONAL SECRET (only disclose after DIRECT and persistent questioning): "${suspect.secretUnrelatedToCase}"\n` +
        `Use "hidden_secret" in revealedKeys ONLY in the reply where you actually admit this secret.`
      : '';

    // Ground the suspect in the case so they don't invent people, times or facts.
    const others = pkg.suspects
      .filter((s) => s.id !== suspect.id)
      .map((s) => `- ${s.name}, ${s.occupation} (${s.relationship})`)
      .join('\n');
    const timelineFacts = (pkg.timeline ?? [])
      .filter((t) => t.isTrue && t.involvedSuspectIds.includes(suspect.id))
      .map((t) => `- ${t.time}: ${t.description}`);
    const facts = [...(suspect.knownFacts ?? []).map((f) => `- ${f}`), ...timelineFacts];
    const voice = (suspect.interviewDialogue ?? [])
      .map((l) => l.text)
      .filter(Boolean)
      .slice(0, 3)
      .map((t) => `- "${t}"`)
      .join('\n');

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
      `- Personality: ${suspect.personality}\n` +
      (voice ? `- How you talk (examples):\n${voice}\n` : '') +
      `\nCASE SETTING: ${pkg.metadata.setting}\n` +
      `CASE BACKGROUND: ${pkg.metadata.briefing}\n\n` +
      `OTHER PEOPLE INVOLVED (the only other people you may name):\n${others || '- none'}\n\n` +
      (facts.length ? `FACTS YOU KNOW (never contradict these):\n${facts.join('\n')}\n\n` : '') +
      `YOUR SITUATION:\n${situationBlock}\n` +
      hiddenBlock +
      `\n\nYOUR ALIBI (what you tell people): "${suspect.alibi}"\n\n` +
      `EVIDENCE THE DETECTIVE CURRENTLY HAS:\n${foundCluesSummary}\n\n` +
      `RESPONSE FORMAT — respond ONLY with valid JSON, nothing before or after:\n` +
      `{"response": "your 2–4 sentence in-character reply", "revealedKeys": []}\n` +
      `revealedKeys lists ZERO or more of ${secretKeys.map((k) => `"${k}"`).join(', ')} — ` +
      `only for things you actually disclose IN THIS reply. Usually it is empty.\n` +
      `- "alibi": you state where you were and what you were doing at the time of the crime\n` +
      (suspect.isHidingSecret ? `- "hidden_secret": you admit your personal secret\n` : '') +
      (suspect.isLying ? `- "contradiction": you are caught out in, or admit, your lie\n` : '') +
      `\nBEHAVIOR RULES:\n` +
      `- Keep responses SHORT: 2–4 sentences. Never write monologues.\n` +
      `- Match your personality at all times: ${suspect.personality}\n` +
      `- Never invent new people, places or times that contradict the facts above\n` +
      `- Be evasive about hidden things — deflect, show emotion, change subject\n` +
      `- Occasionally turn a question back on the detective\n` +
      `- When near exchange ${InterviewService.MAX_EXCHANGES}, start naturally winding down the conversation`
    );
  }

  private parseResponse(raw: string): LlmInterviewPayload {
    const cleaned = String(raw ?? '')
      .trim()
      .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    const fromObject = (p: unknown): LlmInterviewPayload | null => {
      const o = p as Partial<LlmInterviewPayload> | null;
      if (!o || typeof o.response !== 'string' || !o.response.trim()) return null;
      return {
        response: o.response.trim(),
        revealedKeys: Array.isArray(o.revealedKeys)
          ? o.revealedKeys.filter((k): k is string => typeof k === 'string')
          : [],
      };
    };
    const tryParse = (text: string): LlmInterviewPayload | null => {
      try {
        return fromObject(JSON.parse(text));
      } catch {
        return null;
      }
    };

    // 1. The whole reply, then the outermost {...} span (survives nested braces).
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    const parsed =
      tryParse(cleaned) ??
      (first !== -1 && last > first ? tryParse(cleaned.slice(first, last + 1)) : null);
    if (parsed) return parsed;

    // 2. Truncated or malformed JSON: salvage the "response" string by hand.
    const m = cleaned.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)/);
    if (m) {
      let text = m[1];
      try {
        text = JSON.parse(`"${text.replace(/\\$/, '')}"`) as string;
      } catch {
        text = text.replace(/\\"/g, '"').replace(/\\n/g, ' ');
      }
      const keys = cleaned.match(/"revealedKeys"\s*:\s*\[([^\]]*)\]/)?.[1] ?? '';
      return {
        response: text.trim() || '…',
        revealedKeys: [...keys.matchAll(/"([a-z_]+)"/g)].map((k) => k[1]),
      };
    }

    // 3. Plain prose is fine, but never show raw JSON scaffolding to the player.
    if (cleaned && !cleaned.startsWith('{')) return { response: cleaned, revealedKeys: [] };
    return { response: '… (the suspect hesitates and says nothing)', revealedKeys: [] };
  }
}
