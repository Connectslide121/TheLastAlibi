import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  styles: [
    `
      .toast-info {
        border-color: rgba(201, 168, 76, 0.4);
        background: var(--color-surface);
        color: var(--color-text);
      }
      .toast-success {
        border-color: rgba(22, 163, 74, 0.5);
        background: rgba(20, 83, 45, 0.3);
        color: rgb(134, 239, 172);
      }
      .toast-warning {
        border-color: rgba(202, 138, 4, 0.5);
        background: rgba(113, 63, 18, 0.3);
        color: rgb(253, 224, 71);
      }
    `,
  ],
  template: `
    <div class="fixed bottom-5 right-5 z-200 flex flex-col items-end gap-2 pointer-events-none">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          (click)="toastService.dismiss(toast.id)"
          class="flex items-center gap-2 rounded border px-4 py-3 shadow-lg text-sm max-w-sm pointer-events-auto cursor-pointer transition-all duration-300"
          [class.toast-info]="toast.type === 'info'"
          [class.toast-success]="toast.type === 'success'"
          [class.toast-warning]="toast.type === 'warning'"
        >
          <span class="material-icons mi-sm shrink-0 opacity-70">
            {{
              toast.type === 'success'
                ? 'check_circle'
                : toast.type === 'warning'
                  ? 'warning'
                  : 'info'
            }}
          </span>
          <span class="flex-1">{{ toast.message }}</span>
          <button
            type="button"
            class="ml-auto opacity-50 hover:opacity-100 leading-none cursor-pointer"
            aria-label="Dismiss"
          >
            <span class="material-icons mi-sm">close</span>
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastComponent {
  readonly toastService = inject(ToastService);
}
