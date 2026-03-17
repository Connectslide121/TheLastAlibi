import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Clue, CasePackage, Suspect } from '../../models';
import { InterviewService, InterviewChatMessage } from '../../services/interview.service';

@Component({
  selector: 'app-interview-chat',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Backdrop -->
    <div
      class="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6"
      style="background: rgba(0,0,0,0.72);"
    >
      <!-- Chat panel -->
      <div
        class="relative w-full max-w-2xl flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style="background: var(--color-secondary); border: var(--border-style); height: min(86vh, 720px);"
        (click)="$event.stopPropagation()"
      >
        <!-- ─── Header: portrait + name + secrets tracker + close ─── -->
        <div
          class="shrink-0 px-5 py-4 flex items-center gap-4"
          style="border-bottom: var(--border-style); background: linear-gradient(135deg, rgba(201,168,76,0.1), transparent);"
        >
          <!-- Portrait -->
          <div
            class="w-12 h-12 rounded-full overflow-hidden shrink-0"
            style="background: var(--color-surface); border: 1px solid rgba(201,168,76,0.3);"
          >
            @if (suspect().imageUrl) {
              <img
                [src]="suspect().imageUrl"
                [alt]="suspect().name"
                class="w-full h-full object-cover"
              />
            } @else {
              <div class="w-full h-full flex items-center justify-center opacity-40">
                <span class="material-icons" style="font-size: 1.4rem; color: var(--color-text)"
                  >person</span
                >
              </div>
            }
          </div>

          <!-- Name + role -->
          <div class="flex-1 min-w-0">
            <h3
              class="font-heading text-lg leading-tight truncate"
              style="color: var(--color-accent)"
            >
              {{ suspect().name }}
            </h3>
            <p class="font-mono text-xs truncate" style="color: var(--color-text-muted)">
              {{ suspect().occupation }} · {{ suspect().relationship }}
            </p>
          </div>

          <!-- Secrets tracker -->
          @if (!isReadOnly()) {
            <div class="shrink-0 flex flex-col items-end gap-1.5">
              <span
                class="font-mono text-[10px] uppercase tracking-widest"
                style="color: var(--color-text-muted)"
                >{{ revealedCount() }}/{{ totalCount() }} disclosures</span
              >
              <div class="flex gap-1.5">
                @for (secret of secrets(); track secret.key) {
                  <div
                    class="w-3 h-3 rounded-full border-2 transition-all duration-500"
                    [style.background]="secret.revealed ? 'var(--color-accent)' : 'transparent'"
                    [style.border-color]="
                      secret.required ? 'var(--color-accent)' : 'rgba(201,168,76,0.4)'
                    "
                    [attr.title]="secret.label + (secret.revealed ? ' ✓' : '')"
                  ></div>
                }
              </div>
            </div>
          }

          <!-- Close/End button -->
          <button
            type="button"
            (click)="isReadOnly() ? closeInterview() : endInterview()"
            class="shrink-0 p-1.5 rounded opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
            [title]="isReadOnly() ? 'Close' : 'End Interview'"
            style="color: var(--color-text)"
          >
            <span class="material-icons mi-md">close</span>
          </button>
        </div>

        <!-- ─── Exchange progress bar ─── -->
        @if (!isReadOnly()) {
          <div
            class="shrink-0 flex items-center gap-3 px-5 py-2"
            style="background: rgba(0,0,0,0.22); border-bottom: 1px solid rgba(255,255,255,0.05);"
          >
            <span
              class="font-mono text-[10px] uppercase tracking-widest shrink-0"
              style="color: var(--color-text-muted)"
              >Exchange {{ exchangeCount() }}/{{ maxExchanges }}</span
            >
            <div class="flex gap-1 flex-1">
              @for (bar of exchangeBar(); track bar.idx) {
                <div
                  class="h-1 rounded-full flex-1 transition-all duration-300"
                  [style.background]="bar.used ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'"
                ></div>
              }
            </div>
          </div>
        }

        <!-- ─── Chat scroll area ─── -->
        <div #chatContainer class="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          @for (msg of chatHistory(); track $index) {
            @if (msg.role === 'suspect') {
              <!-- Suspect bubble — left side -->
              <div class="flex gap-3 items-start chat-msg-enter">
                <div
                  class="w-7 h-7 rounded-full shrink-0 mt-0.5 flex items-center justify-center"
                  style="background: var(--color-surface);"
                >
                  <span class="material-icons" style="font-size: 0.9rem; color: var(--color-accent)"
                    >record_voice_over</span
                  >
                </div>
                <div
                  class="max-w-[85%] rounded-xl rounded-tl-sm px-4 py-3"
                  style="background: var(--color-surface); border: 1px solid rgba(201,168,76,0.18);"
                >
                  <p
                    class="text-sm leading-relaxed"
                    style="font-family: var(--font-body); color: var(--color-text)"
                  >
                    {{ msg.text }}
                  </p>
                </div>
              </div>
            } @else {
              <!-- Detective bubble — right side -->
              <div class="flex gap-3 items-start flex-row-reverse chat-msg-enter">
                <div
                  class="w-7 h-7 rounded-full shrink-0 mt-0.5 flex items-center justify-center"
                  style="background: rgba(201,168,76,0.18);"
                >
                  <span class="material-icons" style="font-size: 0.9rem; color: var(--color-accent)"
                    >manage_search</span
                  >
                </div>
                <div
                  class="max-w-[85%] rounded-xl rounded-tr-sm px-4 py-3"
                  style="background: rgba(201,168,76,0.1); border: 1px solid rgba(201,168,76,0.22);"
                >
                  <p
                    class="text-sm leading-relaxed"
                    style="font-family: var(--font-body); color: var(--color-text)"
                  >
                    {{ msg.text }}
                  </p>
                </div>
              </div>
            }
          }

          <!-- Thinking indicator -->
          @if (isLoading()) {
            <div class="flex gap-3 items-start">
              <div
                class="w-7 h-7 rounded-full shrink-0 mt-0.5 flex items-center justify-center"
                style="background: var(--color-surface);"
              >
                <span class="material-icons" style="font-size: 0.9rem; color: var(--color-accent)"
                  >record_voice_over</span
                >
              </div>
              <div
                class="px-4 py-3 rounded-xl rounded-tl-sm"
                style="background: var(--color-surface); border: 1px solid rgba(201,168,76,0.18);"
              >
                <div class="flex gap-1.5 items-center h-5">
                  <div
                    class="w-2 h-2 rounded-full thinking-dot"
                    style="background: var(--color-accent); animation-delay: 0ms;"
                  ></div>
                  <div
                    class="w-2 h-2 rounded-full thinking-dot"
                    style="background: var(--color-accent); animation-delay: 180ms;"
                  ></div>
                  <div
                    class="w-2 h-2 rounded-full thinking-dot"
                    style="background: var(--color-accent); animation-delay: 360ms;"
                  ></div>
                </div>
              </div>
            </div>
          }
        </div>

        <!-- ─── Suggested question chips ─── -->
        @if (
          suggestedQuestions().length > 0 &&
          !isComplete() &&
          !pendingCompletion() &&
          !isLoading() &&
          !isReadOnly()
        ) {
          <div
            class="shrink-0 px-4 py-2.5 flex gap-2 flex-wrap"
            style="border-top: 1px solid rgba(255,255,255,0.06);"
          >
            <span
              class="font-mono text-[10px] uppercase tracking-widest self-center shrink-0 mr-1"
              style="color: var(--color-text-muted)"
              >Nudge:</span
            >
            @for (q of suggestedQuestions(); track q) {
              <button
                type="button"
                (click)="useSuggested(q)"
                class="text-xs font-mono px-3 py-1.5 rounded-full border cursor-pointer hover:opacity-80 transition-opacity"
                style="border-color: rgba(201,168,76,0.28); color: var(--color-text-muted); background: rgba(201,168,76,0.06);"
              >
                {{ q }}
              </button>
            }
          </div>
        }

        <!-- ─── Pending completion notice ─── -->
        @if (pendingCompletion() && !isComplete()) {
          <div
            class="shrink-0 px-4 py-3 flex items-center gap-3"
            style="border-top: 1px solid rgba(201,168,76,0.3); background: rgba(201,168,76,0.06);"
          >
            <span
              class="material-icons shrink-0"
              style="font-size: 1.1rem; color: var(--color-accent);"
              >check_circle</span
            >
            <p class="flex-1 text-xs font-mono leading-relaxed" style="color: var(--color-text);">
              @if (allRequiredRevealed()) {
                All key disclosures made — scroll up to review, then view the summary.
              } @else {
                Exchange limit reached — scroll up to review, then view the summary.
              }
            </p>
            <button
              type="button"
              (click)="proceedToSummary()"
              class="px-3 py-1.5 rounded font-mono text-xs uppercase tracking-widest cursor-pointer hover:opacity-80 transition-opacity border shrink-0"
              style="border-color: var(--color-accent); color: var(--color-accent);"
            >
              View Summary
            </button>
          </div>
        }

        <!-- ─── Read-only footer ─── -->
        @if (isReadOnly()) {
          <div
            class="shrink-0 px-4 py-3 flex items-center justify-between"
            style="border-top: var(--border-style);"
          >
            <span
              class="font-mono text-xs uppercase tracking-widest"
              style="color: var(--color-text-muted);"
              >Interview Record</span
            >
            <button
              type="button"
              (click)="closeInterview()"
              class="px-4 py-1.5 text-xs font-mono uppercase tracking-widest rounded border cursor-pointer hover:opacity-80 transition-opacity"
              style="border-color: var(--color-accent); color: var(--color-accent);"
            >
              Close
            </button>
          </div>
        }

        <!-- ─── Input bar ─── -->
        @if (!isComplete() && !pendingCompletion() && !isReadOnly()) {
          <div
            class="shrink-0 px-4 py-3 flex gap-2 items-center"
            style="border-top: var(--border-style);"
          >
            <input
              #inputEl
              type="text"
              [value]="userInput()"
              (input)="userInput.set($any($event.target).value)"
              (keydown.enter)="sendMessage()"
              placeholder="Ask a question…"
              [disabled]="isLoading()"
              autocomplete="off"
              class="flex-1 rounded-lg px-4 py-2 text-sm font-mono focus:outline-none disabled:opacity-50"
              style="background: var(--color-surface); border: 1px solid rgba(201,168,76,0.22); color: var(--color-text);"
            />
            <button
              type="button"
              (click)="sendMessage()"
              [disabled]="isLoading() || !userInput().trim()"
              class="p-2.5 rounded-lg cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-30"
              style="background: rgba(201,168,76,0.18); color: var(--color-accent);"
            >
              <span class="material-icons mi-md">send</span>
            </button>
            <button
              type="button"
              (click)="endInterview()"
              [disabled]="isLoading()"
              class="px-3 py-2 rounded-lg font-mono text-xs uppercase tracking-widest cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-30 border"
              style="border-color: rgba(255,255,255,0.15); color: var(--color-text-muted);"
            >
              End
            </button>
          </div>
        }
      </div>

      <!-- ─── Completion overlay ─── -->
      @if (isComplete()) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
          style="background: rgba(0,0,0,0.75);"
        >
          <div
            class="w-full max-w-md rounded-xl p-7 flex flex-col gap-5 shadow-2xl"
            style="background: var(--color-secondary); border: var(--border-style); animation: interviewFadeIn 0.24s ease both;"
          >
            <div class="flex items-center gap-3">
              <span
                class="material-icons shrink-0"
                style="font-size: 2rem; color: var(--color-accent)"
                >assignment_turned_in</span
              >
              <h3 class="font-heading text-2xl" style="color: var(--color-accent)">
                Interview Complete
              </h3>
            </div>
            <p
              class="font-mono text-xs uppercase tracking-widest"
              style="color: var(--color-text-muted)"
            >
              {{ suspect().name }} — {{ suspect().occupation }}
            </p>
            <p
              class="text-sm italic leading-relaxed"
              style="font-family: var(--font-body); color: var(--color-text); opacity: 0.8;"
            >
              {{ completionMessage() }}
            </p>

            <!-- Secrets checklist -->
            <div class="flex flex-col gap-2">
              @for (secret of secrets(); track secret.key) {
                <div
                  class="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                  style="background: rgba(255,255,255,0.04);"
                >
                  <span
                    class="material-icons shrink-0"
                    style="font-size: 1.1rem;"
                    [style.color]="
                      secret.revealed ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)'
                    "
                  >
                    {{ secret.revealed ? 'check_circle' : 'radio_button_unchecked' }}
                  </span>
                  <span
                    class="text-sm font-mono flex-1"
                    [style.color]="
                      secret.revealed ? 'var(--color-text)' : 'var(--color-text-muted)'
                    "
                    >{{ secret.label }}</span
                  >
                  @if (secret.required && !secret.revealed) {
                    <span
                      class="text-[10px] font-mono uppercase px-2 py-0.5 rounded shrink-0"
                      style="background: rgba(185,28,28,0.25); color: rgb(252,165,165);"
                      >Missed</span
                    >
                  }
                </div>
              }
            </div>

            <button
              type="button"
              (click)="closeInterview()"
              class="mt-1 w-full py-2.5 px-6 rounded-lg border font-mono uppercase tracking-widest text-sm cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center gap-2"
              style="border-color: var(--color-accent); color: var(--color-accent);"
            >
              <span class="material-icons mi-sm">arrow_forward</span>
              Continue Investigation
            </button>
          </div>
        </div>
      }
    </div>

    <style>
      @keyframes interviewFadeIn {
        from {
          opacity: 0;
          transform: scale(0.97) translateY(6px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
      .chat-msg-enter {
        animation: interviewFadeIn 0.18s ease both;
      }
      .thinking-dot {
        animation: thinkingBounce 1.2s infinite;
      }
      @keyframes thinkingBounce {
        0%,
        60%,
        100% {
          transform: translateY(0);
          opacity: 0.6;
        }
        30% {
          transform: translateY(-4px);
          opacity: 1;
        }
      }
    </style>
  `,
})
export class InterviewChatComponent implements OnInit, AfterViewChecked {
  readonly suspect = input.required<Suspect>();
  readonly casePackage = input.required<CasePackage>();
  readonly foundClues = input.required<Clue[]>();
  readonly sessionId = input.required<string>();
  readonly revisitTranscript = input<InterviewChatMessage[] | null>(null);
  readonly interviewClosed = output<void>();

  private readonly service = inject(InterviewService);
  private readonly chatContainer = viewChild<ElementRef<HTMLElement>>('chatContainer');
  private shouldScrollToBottom = false;

  readonly userInput = signal('');
  readonly maxExchanges = InterviewService.MAX_EXCHANGES;

  readonly isReadOnly = computed(() => this.revisitTranscript() != null);

  // Proxies into the service so the template tracks them reactively
  readonly chatHistory = this.service.chatHistory;
  readonly suggestedQuestions = this.service.suggestedQuestions;
  readonly secrets = this.service.secrets;
  readonly isLoading = this.service.isLoading;
  readonly isComplete = this.service.isComplete;
  readonly pendingCompletion = this.service.pendingCompletion;
  readonly allRequiredRevealed = this.service.allRequiredRevealed;
  readonly exchangeCount = this.service.exchangeCount;
  readonly revealedCount = this.service.revealedCount;
  readonly totalCount = this.service.totalCount;

  readonly exchangeBar = computed(() =>
    Array.from({ length: this.maxExchanges }, (_, i) => ({
      idx: i,
      used: i < this.exchangeCount(),
    })),
  );

  readonly completionMessage = computed(() => {
    if (this.service.allRequiredRevealed()) {
      return `${this.suspect().name} has shared their alibi and all key disclosures. You have what you need from this interview.`;
    }
    if (this.exchangeCount() >= this.maxExchanges) {
      return `The interview has reached its limit. ${this.suspect().name} excuses themselves. You can return if new leads emerge.`;
    }
    return `Interview ended by the detective.`;
  });

  constructor() {
    // Flag scroll-to-bottom whenever the chat history changes
    effect(() => {
      this.chatHistory();
      this.shouldScrollToBottom = true;
    });
  }

  ngOnInit(): void {
    const transcript = this.revisitTranscript();
    if (transcript != null) {
      this.service.loadTranscript(transcript);
    } else {
      this.service.startSession(
        this.suspect(),
        this.casePackage(),
        this.foundClues(),
        this.sessionId(),
      );
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.shouldScrollToBottom = false;
      const el = this.chatContainer()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }

  proceedToSummary(): void {
    this.service.proceedToSummary();
  }

  sendMessage(): void {
    const text = this.userInput().trim();
    if (!text || this.isLoading() || this.isComplete() || this.isReadOnly()) return;
    this.userInput.set('');
    this.service.sendMessage(text).subscribe();
  }

  useSuggested(question: string): void {
    this.userInput.set(question);
  }

  endInterview(): void {
    this.service.endSession();
  }

  closeInterview(): void {
    this.interviewClosed.emit();
  }
}
