import { Component, OnInit, OnDestroy, input, signal } from '@angular/core';

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
      class="min-h-screen w-full flex flex-col items-center justify-center gap-8"
      style="background: var(--color-primary)"
    >
      <!-- Spinner with magnifying-glass icon in the centre -->
      <div class="relative w-28 h-28 shrink-0">
        <!-- faint track ring -->
        <div
          class="absolute inset-0 rounded-full"
          style="border: 3px solid rgba(201,168,76,0.2)"
        ></div>
        <!-- outer spinning arc -->
        <div
          class="absolute inset-0 rounded-full animate-spin"
          style="border: 3px solid transparent; border-top-color: #c9a84c"
        ></div>
        <!-- inner counter-spinning arc -->
        <div
          class="absolute rounded-full animate-spin"
          style="inset: 10px; border: 2px solid transparent; border-bottom-color: rgba(201,168,76,0.65); animation-duration: 1.6s; animation-direction: reverse"
        ></div>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="material-icons" style="font-size: 2.25rem; color: #c9a84c">search</span>
        </div>
      </div>

      <!-- Text block -->
      <div class="flex flex-col items-center gap-3 text-center px-6">
        <p
          class="font-serif text-xl tracking-widest transition-opacity duration-500"
          style="color: var(--color-accent)"
          [style.opacity]="fading() ? '0' : '1'"
        >
          {{ flavorText() }}
        </p>
        @if (message()) {
          <p
            class="font-mono text-xs tracking-widest uppercase"
            style="color: var(--color-text-muted)"
          >
            {{ message() }}
          </p>
        }
      </div>

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
  readonly message = input('');

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
