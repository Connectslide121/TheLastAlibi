import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ThemeService, STYLE_OVERRIDES_KEY } from '../../services/theme.service';
import { UITheme } from '../../models';

type TextureFamily = UITheme['textureFamily'];

interface StyleValues {
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  colorSurface: string;
  colorText: string;
  colorTextMuted: string;
  borderStyle: string;
  shadowStyle: string;
  textureFamily: TextureFamily;
}

const DEFAULTS: StyleValues = {
  colorPrimary: '#1a1a2e',
  colorSecondary: '#16213e',
  colorAccent: '#c9a84c',
  colorSurface: '#0f0f23',
  colorText: '#e8e0d0',
  colorTextMuted: '#9e9e8e',
  borderStyle: '1px solid rgba(201, 168, 76, 0.3)',
  shadowStyle: '0 4px 24px rgba(0, 0, 0, 0.6)',
  textureFamily: 'grain',
};

const TEXTURES: { value: TextureFamily; label: string }[] = [
  { value: 'paper', label: 'Paper' },
  { value: 'grain', label: 'Grain' },
  { value: 'cork', label: 'Cork' },
  { value: 'metal', label: 'Metal' },
  { value: 'leather', label: 'Leather' },
  { value: 'fabric', label: 'Fabric' },
  { value: 'pixel_noise', label: 'Pixel Noise' },
];

const COLOR_FIELDS: { field: keyof StyleValues; cssVar: string; label: string }[] = [
  { field: 'colorPrimary', cssVar: '--color-primary', label: 'Primary Background' },
  { field: 'colorSecondary', cssVar: '--color-secondary', label: 'Secondary Background' },
  { field: 'colorSurface', cssVar: '--color-surface', label: 'Panel / Surface' },
  { field: 'colorAccent', cssVar: '--color-accent', label: 'Accent / Gold' },
  { field: 'colorText', cssVar: '--color-text', label: 'Main Text' },
  { field: 'colorTextMuted', cssVar: '--color-text-muted', label: 'Muted Text' },
];

@Component({
  selector: 'app-style-config',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'fixed inset-0 z-[130] block',
    '(document:keydown.escape)': 'closed.emit()',
  },
  template: `
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/60" (click)="closed.emit()"></div>

    <!-- Drawer panel -->
    <section
      class="absolute right-0 top-0 bottom-0 w-[360px] max-w-full flex flex-col overflow-hidden"
      style="background: var(--color-secondary); border-left: var(--border-style); box-shadow: var(--shadow-style)"
      (click)="$event.stopPropagation()"
    >
      <!-- Header -->
      <div
        class="shrink-0 flex items-center justify-between px-5 py-4"
        style="border-bottom: var(--border-style)"
      >
        <div>
          <h2 class="font-heading text-lg text-(--color-accent)">Style Overrides</h2>
          <p class="font-mono text-xs text-(--color-text-muted) mt-0.5">Changes apply live</p>
        </div>
        <button
          type="button"
          (click)="closed.emit()"
          class="p-1.5 rounded hover:opacity-70 transition-opacity cursor-pointer text-(--color-text-muted)"
        >
          <span class="material-icons">close</span>
        </button>
      </div>

      <!-- Scrollable body -->
      <div class="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6">
        <!-- Colors -->
        <div>
          <p class="font-mono text-xs uppercase tracking-widest text-(--color-text-muted) mb-3">
            Colors
          </p>
          <div class="flex flex-col gap-2">
            @for (field of colorFields; track field.cssVar) {
              <div class="flex items-center gap-3 py-1">
                <!-- Label -->
                <span class="font-mono text-xs text-(--color-text) w-36 shrink-0">
                  {{ field.label }}
                </span>
                <!-- Native color picker — visible, full-width clickable swatch -->
                <label
                  [for]="'sc-' + field.field"
                  class="relative h-8 w-10 rounded cursor-pointer shrink-0 overflow-hidden border"
                  style="border-color: rgba(255,255,255,0.25); padding: 2px;"
                  [style.background]="values()[field.field]"
                  title="Open color picker"
                >
                  <input
                    [id]="'sc-' + field.field"
                    type="color"
                    [value]="toHex(values()[field.field])"
                    (input)="onColorInput(field.field, field.cssVar, $event)"
                    class="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                </label>
                <!-- Hex text input -->
                <input
                  type="text"
                  [value]="values()[field.field]"
                  (change)="onHexTextChange(field.field, field.cssVar, $event)"
                  class="flex-1 min-w-0 px-2 py-1.5 text-xs font-mono rounded border bg-transparent text-(--color-text) cursor-text"
                  style="border-color: rgba(255,255,255,0.15)"
                  placeholder="#rrggbb"
                />
              </div>
            }
          </div>
        </div>

        <!-- Border & Shadow -->
        <div>
          <p class="font-mono text-xs uppercase tracking-widest text-(--color-text-muted) mb-3">
            Border &amp; Shadow
          </p>
          <div class="flex flex-col gap-3">
            <div>
              <label class="font-mono text-xs text-(--color-text-muted) block mb-1">
                Border Style (CSS)
              </label>
              <input
                type="text"
                [value]="values().borderStyle"
                (change)="onTextChange('borderStyle', '--border-style', $event)"
                class="w-full px-3 py-2 text-xs font-mono rounded border bg-transparent text-(--color-text)"
                style="border-color: rgba(255,255,255,0.15)"
                placeholder="1px solid rgba(201,168,76,0.3)"
              />
            </div>
            <div>
              <label class="font-mono text-xs text-(--color-text-muted) block mb-1">
                Shadow Style (CSS)
              </label>
              <input
                type="text"
                [value]="values().shadowStyle"
                (change)="onTextChange('shadowStyle', '--shadow-style', $event)"
                class="w-full px-3 py-2 text-xs font-mono rounded border bg-transparent text-(--color-text)"
                style="border-color: rgba(255,255,255,0.15)"
                placeholder="0 4px 24px rgba(0,0,0,0.6)"
              />
            </div>
          </div>
        </div>

        <!-- Texture -->
        <div>
          <p class="font-mono text-xs uppercase tracking-widest text-(--color-text-muted) mb-3">
            Body Texture
          </p>
          <select
            [value]="values().textureFamily"
            (change)="onTextureChange($event)"
            class="w-full px-3 py-2 text-xs font-mono rounded border bg-(--color-secondary) text-(--color-text) cursor-pointer"
            style="border-color: rgba(255,255,255,0.15)"
          >
            @for (t of textures; track t.value) {
              <option [value]="t.value" [selected]="values().textureFamily === t.value">
                {{ t.label }}
              </option>
            }
          </select>
        </div>

        <!-- Live preview bar -->
        <div
          class="rounded-lg p-3 text-center"
          [style.background]="values().colorSurface"
          [style.border]="values().borderStyle"
          [style.box-shadow]="values().shadowStyle"
        >
          <span class="font-heading text-sm" [style.color]="values().colorAccent">
            Heading preview
          </span>
          <span class="block font-mono text-xs mt-1" [style.color]="values().colorText">
            Body text sample
          </span>
          <span class="block font-mono text-xs" [style.color]="values().colorTextMuted">
            Muted text sample
          </span>
        </div>
      </div>

      <!-- Footer -->
      <div class="shrink-0 px-5 py-4 flex gap-3" style="border-top: var(--border-style)">
        <button
          type="button"
          (click)="resetToAI()"
          class="flex-1 py-2 text-xs font-mono uppercase tracking-widest rounded border cursor-pointer hover:opacity-80 transition-opacity text-(--color-text-muted)"
          style="border-color: rgba(255,255,255,0.2)"
        >
          <span class="material-icons mi-sm">refresh</span>
          Reset to AI
        </button>
        <button
          type="button"
          (click)="closed.emit()"
          class="flex-1 py-2 text-xs font-mono uppercase tracking-widest rounded border cursor-pointer hover:opacity-80 transition-opacity text-(--color-accent)"
          style="border-color: var(--color-accent)"
        >
          Done
        </button>
      </div>
    </section>
  `,
})
export class StyleConfigComponent implements OnInit {
  private readonly doc = inject(DOCUMENT);
  private readonly themeSvc = inject(ThemeService);

  readonly originalTheme = input<UITheme | null>(null);
  readonly closed = output<void>();

  readonly colorFields = COLOR_FIELDS;
  readonly textures = TEXTURES;

  readonly values = signal<StyleValues>({ ...DEFAULTS });

  ngOnInit(): void {
    this.values.set(this.readCurrentValues());
  }

  private persist(v: StyleValues): void {
    const overrides: Record<string, string> = {
      '--color-primary': v.colorPrimary,
      '--color-secondary': v.colorSecondary,
      '--color-accent': v.colorAccent,
      '--color-surface': v.colorSurface,
      '--color-text': v.colorText,
      '--color-text-muted': v.colorTextMuted,
      '--border-style': v.borderStyle,
      '--shadow-style': v.shadowStyle,
      'data-texture': v.textureFamily,
    };
    localStorage.setItem(STYLE_OVERRIDES_KEY, JSON.stringify(overrides));
  }

  private readCurrentValues(): StyleValues {
    const get = (varName: string, fallback: string): string => {
      return this.doc.documentElement.style.getPropertyValue(varName).trim() || fallback;
    };

    return {
      colorPrimary: get('--color-primary', DEFAULTS.colorPrimary),
      colorSecondary: get('--color-secondary', DEFAULTS.colorSecondary),
      colorAccent: get('--color-accent', DEFAULTS.colorAccent),
      colorSurface: get('--color-surface', DEFAULTS.colorSurface),
      colorText: get('--color-text', DEFAULTS.colorText),
      colorTextMuted: get('--color-text-muted', DEFAULTS.colorTextMuted),
      borderStyle: get('--border-style', DEFAULTS.borderStyle),
      shadowStyle: get('--shadow-style', DEFAULTS.shadowStyle),
      textureFamily:
        (this.doc.body.getAttribute('data-texture') as TextureFamily) || DEFAULTS.textureFamily,
    };
  }

  onColorInput(field: keyof StyleValues, cssVar: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.values.update((v) => ({ ...v, [field]: value }));
    this.doc.documentElement.style.setProperty(cssVar, value);
    this.persist(this.values());
  }

  /** Ensure a value passed to <input type="color"> is a 6-digit hex string. */
  toHex(value: string): string {
    if (/^#[0-9a-f]{6}$/i.test(value)) return value;
    // Try rgb(r, g, b)
    const rgb = value.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (rgb) {
      return (
        '#' +
        [rgb[1], rgb[2], rgb[3]].map((n) => parseInt(n, 10).toString(16).padStart(2, '0')).join('')
      );
    }
    // Short hex → expand
    const short = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
    // Fallback – return as-is and let the browser handle it
    return value;
  }

  onHexTextChange(field: keyof StyleValues, cssVar: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    if (!value) return;
    this.values.update((v) => ({ ...v, [field]: value }));
    this.doc.documentElement.style.setProperty(cssVar, value);
    this.persist(this.values());
  }

  onTextChange(field: keyof StyleValues, cssVar: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.values.update((v) => ({ ...v, [field]: value }));
    this.doc.documentElement.style.setProperty(cssVar, value);
    this.persist(this.values());
  }

  onTextureChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as TextureFamily;
    this.values.update((v) => ({ ...v, textureFamily: value }));
    this.themeSvc.applyTexture(value);
    this.persist(this.values());
  }

  resetToAI(): void {
    const theme = this.originalTheme();
    this.themeSvc.clearStoredOverrides();
    if (theme) {
      // applyTheme would re-apply stored overrides, but we just cleared them
      const root = this.doc.documentElement;
      root.style.setProperty('--color-primary', theme.primaryColor);
      root.style.setProperty('--color-secondary', theme.secondaryColor);
      root.style.setProperty('--color-accent', theme.accentColor);
      root.style.setProperty('--color-surface', theme.surfaceColor);
      root.style.setProperty('--color-text', theme.textColor);
      root.style.setProperty('--border-style', theme.borderStyle);
      root.style.setProperty('--shadow-style', theme.shadowStyle);
      root.style.setProperty('--panel-style', theme.panelStyle);
      root.style.removeProperty('--color-text-muted');
      this.themeSvc.applyTexture(theme.textureFamily);
    } else {
      this.themeSvc.resetTheme();
    }
    this.values.set(this.readCurrentValues());
  }
}
