import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  show(message: string, type: Toast['type'] = 'info'): void {
    const id = crypto.randomUUID();
    this._toasts.update((list) => [...list, { id, message, type }]);
    setTimeout(() => this.dismiss(id), 3000);
  }

  dismiss(id: string): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
