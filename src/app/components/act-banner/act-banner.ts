import { Component, OnInit, OnDestroy, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-act-banner',
  standalone: true,
  template: `
    <div
      class="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer transition-opacity duration-500"
      [class.opacity-0]="!visible()"
      [class.opacity-100]="visible()"
      style="background: rgba(0,0,0,0.88);"
      (click)="dismiss()"
    >
      <div class="text-center px-8 max-w-2xl">
        <p
          class="text-(--color-accent) text-sm tracking-[0.5em] uppercase mb-4 font-mono opacity-80"
        >
          Act {{ act() }}
        </p>
        <h2 class="act-title-enter text-(--color-text) font-serif text-5xl font-bold mb-6 leading-tight">
          {{ title() }}
        </h2>
        <p class="text-(--color-text) text-lg leading-relaxed opacity-70">
          {{ summary() }}
        </p>
        <p
          class="text-(--color-text) text-xs mt-10 animate-pulse tracking-widest uppercase opacity-40 flex items-center justify-center gap-2"
        >
          <span class="material-icons mi-sm">touch_app</span>
          Click anywhere to continue
        </p>
      </div>
    </div>
  `,
})
export class ActBannerComponent implements OnInit, OnDestroy {
  readonly act = input.required<1 | 2 | 3>();
  readonly title = input.required<string>();
  readonly summary = input.required<string>();
  readonly dismissed = output<void>();

  readonly visible = signal(false);

  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    // Small delay so the opacity transition plays on entry
    setTimeout(() => this.visible.set(true), 50);
    this.dismissTimer = setTimeout(() => this.dismiss(), 6000);
  }

  ngOnDestroy(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
  }

  dismiss(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
    this.visible.set(false);
    setTimeout(() => this.dismissed.emit(), 500);
  }
}
