import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { UITheme } from '../models';

export const STYLE_OVERRIDES_KEY = 'tla_style_overrides';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  applyTheme(theme: UITheme): void {
    const root = this.document.documentElement;
    root.style.setProperty('--color-primary', theme.primaryColor);
    root.style.setProperty('--color-secondary', theme.secondaryColor);
    root.style.setProperty('--color-accent', theme.accentColor);
    root.style.setProperty('--color-surface', theme.surfaceColor);
    root.style.setProperty('--color-text', theme.textColor);
    root.style.setProperty('--border-style', theme.borderStyle);
    root.style.setProperty('--shadow-style', theme.shadowStyle);
    root.style.setProperty('--panel-style', theme.panelStyle);
    this.applyTexture(theme.textureFamily);
    // Re-apply any user overrides on top of the AI theme
    this.applyStoredOverrides();
  }

  /** Apply any previously saved user style overrides to the document root. */
  applyStoredOverrides(): void {
    try {
      const raw = localStorage.getItem(STYLE_OVERRIDES_KEY);
      if (!raw) return;
      const overrides: Record<string, string> = JSON.parse(raw);
      const root = this.document.documentElement;
      for (const [prop, value] of Object.entries(overrides)) {
        if (prop === 'data-texture') {
          this.document.body.setAttribute('data-texture', value);
        } else {
          root.style.setProperty(prop, value);
        }
      }
    } catch {
      // Ignore malformed storage
    }
  }

  clearStoredOverrides(): void {
    localStorage.removeItem(STYLE_OVERRIDES_KEY);
  }

  applyTexture(textureFamily: UITheme['textureFamily']): void {
    this.document.body.setAttribute('data-texture', textureFamily);
  }

  resetTheme(): void {
    const root = this.document.documentElement;
    root.style.removeProperty('--color-primary');
    root.style.removeProperty('--color-secondary');
    root.style.removeProperty('--color-accent');
    root.style.removeProperty('--color-surface');
    root.style.removeProperty('--color-text');
    root.style.removeProperty('--color-text-muted');
    root.style.removeProperty('--border-style');
    root.style.removeProperty('--shadow-style');
    root.style.removeProperty('--panel-style');
    this.document.body.removeAttribute('data-texture');
  }
}
