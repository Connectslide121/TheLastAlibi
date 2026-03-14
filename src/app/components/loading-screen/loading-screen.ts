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
];

@Component({
  selector: 'app-loading-screen',
  standalone: true,
  template: `
    <div class="fixed inset-0 flex flex-col items-center justify-center bg-(--color-primary) z-50">
      <div
        class="w-16 h-16 border-4 border-(--color-surface) border-t-(--color-accent) rounded-full animate-spin mb-8"
      ></div>
      <p
        class="text-(--color-accent) font-serif text-xl tracking-widest transition-opacity duration-500"
        [style.opacity]="fading() ? '0' : '1'"
      >
        {{ displayMessage() }}
      </p>
    </div>
  `,
})
export class LoadingScreenComponent implements OnInit, OnDestroy {
  readonly message = input('');

  readonly displayMessage = signal('');
  readonly fading = signal(false);

  private msgIdx = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    const msg = this.message();
    this.displayMessage.set(msg || FLAVOR[0]);
    if (!msg) {
      this.timer = setInterval(() => {
        this.fading.set(true);
        setTimeout(() => {
          this.msgIdx = (this.msgIdx + 1) % FLAVOR.length;
          this.displayMessage.set(FLAVOR[this.msgIdx]);
          this.fading.set(false);
        }, 400);
      }, 2500);
    }
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
