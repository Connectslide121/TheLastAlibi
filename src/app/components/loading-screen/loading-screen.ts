import { Component, OnInit, OnDestroy, input, signal } from '@angular/core';
import { GenerationStepStatus } from '../../services/llm.service';

const FLAVOR: string[] = [
  'Gathering evidence...',
  'Questioning witnesses...',
  'Dusting for fingerprints...',
  'Reviewing case files...',
  'Consulting the archives...',
  'Following the money...',
  'Reconstructing the timeline...',
  'Analyzing alibis...',
  'Examining the crime scene...',
  'Cross-referencing suspects...',
];

@Component({
  selector: 'app-loading-screen',
  standalone: true,
  template: `
    <div
      class="min-h-screen w-full flex flex-col items-center justify-center gap-8 py-12"
      style="background: var(--color-primary)"
    >
      <!-- Spinner with magnifying-glass icon in the centre -->
      <div class="relative w-28 h-28 shrink-0">
        <div
          class="absolute inset-0 rounded-full"
          style="border: 3px solid rgba(201,168,76,0.2)"
        ></div>
        <div
          class="absolute inset-0 rounded-full animate-spin"
          style="border: 3px solid transparent; border-top-color: #c9a84c"
        ></div>
        <div
          class="absolute rounded-full animate-spin"
          style="inset: 10px; border: 2px solid transparent; border-bottom-color: rgba(201,168,76,0.65); animation-duration: 1.6s; animation-direction: reverse"
        ></div>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="material-icons" style="font-size: 2.25rem; color: #c9a84c">search</span>
        </div>
      </div>

      <!-- Rotating flavor text -->
      <p
        class="font-serif text-xl tracking-widest transition-opacity duration-500"
        style="color: var(--color-accent)"
        [style.opacity]="fading() ? '0' : '1'"
      >
        {{ flavorText() }}
      </p>

      <!-- Step list -->
      @if (steps().length > 0) {
        <div
          class="w-full max-w-sm flex flex-col gap-1 px-6"
          style="border: var(--border-style); border-radius: 8px; padding: 1rem 1.5rem; background: var(--color-secondary)"
        >
          @for (step of steps(); track step.label) {
            <div
              class="flex items-start gap-3 py-1.5 transition-opacity duration-400"
              [style.opacity]="step.status === 'pending' ? '0.4' : '1'"
            >
              <!-- Status icon -->
              @if (step.status === 'done') {
                <span
                  class="material-icons shrink-0 mt-0.5"
                  style="font-size: 1.1rem; color: #c9a84c"
                  >check_circle</span
                >
              } @else if (step.status === 'active') {
                <span
                  class="shrink-0 mt-0.5 w-4 h-4 rounded-full border-2 animate-spin"
                  style="border-color: rgba(201,168,76,0.3); border-top-color: #c9a84c; animation-duration: 0.8s"
                ></span>
              } @else if (step.status === 'error') {
                <span
                  class="material-icons shrink-0 mt-0.5"
                  style="font-size: 1.1rem; color: #e06c75"
                  >error</span
                >
              } @else {
                <span
                  class="material-icons shrink-0 mt-0.5"
                  style="font-size: 1.1rem; color: var(--color-text-muted)"
                  >radio_button_unchecked</span
                >
              }

              <!-- Label + detail -->
              <div class="flex flex-col min-w-0">
                <span
                  class="font-mono text-xs font-semibold tracking-wide uppercase"
                  [style.color]="
                    step.status === 'done'
                      ? '#c9a84c'
                      : step.status === 'active'
                        ? 'var(--color-text)'
                        : 'var(--color-text-muted)'
                  "
                  >{{ step.label }}</span
                >
                <span class="font-mono text-xs mt-0.5" style="color: var(--color-text-muted)">{{
                  step.detail
                }}</span>
              </div>
            </div>
          }
        </div>
      }

      <!-- Bouncing dots -->
      <div class="flex gap-2">
        @for (delay of [0, 160, 320]; track delay) {
          <span
            class="w-2 h-2 rounded-full animate-bounce"
            style="background: var(--color-accent); opacity: 0.5"
            [style.animation-delay]="delay + 'ms'"
          ></span>
        }
      </div>
    </div>
  `,
})
export class LoadingScreenComponent implements OnInit, OnDestroy {
  readonly steps = input<GenerationStepStatus[]>([]);

  readonly flavorText = signal(FLAVOR[0]);
  readonly fading = signal(false);

  private msgIdx = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.timer = setInterval(() => {
      this.fading.set(true);
      setTimeout(() => {
        this.msgIdx = (this.msgIdx + 1) % FLAVOR.length;
        this.flavorText.set(FLAVOR[this.msgIdx]);
        this.fading.set(false);
      }, 400);
    }, 2500);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
