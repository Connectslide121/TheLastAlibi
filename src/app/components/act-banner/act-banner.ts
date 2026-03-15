import { Component, OnInit, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-act-banner',
  standalone: true,
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center cursor-pointer transition-opacity duration-500 overflow-y-auto"
      [class.opacity-0]="!visible()"
      [class.opacity-100]="visible()"
      style="background: rgba(0,0,0,0.92);"
      (click)="dismiss()"
    >
      <div
        class="relative w-full max-w-lg mx-4 my-8 rounded-lg overflow-hidden flex flex-col"
        style="background: var(--color-secondary); border: var(--border-style); box-shadow: 0 8px 40px rgba(0,0,0,0.8);"
        (click)="$event.stopPropagation()"
      >
        <!-- Hero image -->
        @if (imageUrl()) {
          <div class="w-full shrink-0" style="aspect-ratio: 3/2; background: var(--color-surface)">
            <img [src]="imageUrl()" alt="" class="w-full h-full object-cover" />
          </div>
        }

        <!-- Text content -->
        <div class="p-8 flex flex-col gap-4 text-center">
          <p class="text-(--color-accent) text-xs tracking-[0.5em] uppercase font-mono opacity-80">
            Act {{ act() }}
          </p>
          <h2
            class="act-title-enter font-serif text-4xl font-bold leading-tight"
            style="color: var(--color-text)"
          >
            {{ title() }}
          </h2>
          <p class="text-base leading-relaxed opacity-70" style="color: var(--color-text)">
            {{ summary() }}
          </p>
        </div>

        <!-- Footer hint -->
        <div
          class="px-8 pb-6 flex items-center justify-center gap-2 animate-pulse"
          style="color: var(--color-text-muted)"
          (click)="dismiss()"
        >
          <span class="material-icons mi-sm">touch_app</span>
          <span class="font-mono text-xs tracking-widest uppercase opacity-50"
            >Click to continue</span
          >
        </div>
      </div>
    </div>
  `,
})
export class ActBannerComponent implements OnInit {
  readonly act = input.required<1 | 2 | 3>();
  readonly title = input.required<string>();
  readonly summary = input.required<string>();
  readonly imageUrl = input('');
  readonly dismissed = output<void>();

  readonly visible = signal(false);

  ngOnInit(): void {
    // Small delay so the opacity transition plays on entry
    setTimeout(() => this.visible.set(true), 50);
  }

  dismiss(): void {
    this.visible.set(false);
    setTimeout(() => this.dismissed.emit(), 500);
  }
}
