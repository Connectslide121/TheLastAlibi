# The Last Alibi — Copilot Instructions

> Read this file **before** writing any code in this repo. It defines every convention in use.

---

## Project Overview

**The Last Alibi** is an Angular 21 single-page application: an AI-powered detective mystery game where Gemini generates a unique case package (suspects, clues, puzzles, timeline, theme) and the player investigates and accuses a culprit.

---

## Implementation Plan

`IMPLEMENTATION_PLAN.md` in the repo root is the **single source of truth** for feature progress.

- **Always update it** when completing work: change `- [ ]` to `- [x]` for every finished item.
- Update the footer line (`*Last updated: Phase N — Complete ✓ (Phase N+1 next)*`) after each phase.
- Use this PowerShell pattern to bulk-check a phase (replace `## Phase N` / `## Phase N+1`):
  ```powershell
  $c = Get-Content IMPLEMENTATION_PLAN.md -Raw
  $s = $c.IndexOf('## Phase N')
  $e = $c.IndexOf('## Phase N+1')
  $block = $c.Substring($s, $e - $s) -replace '- \[ \]', '- [x]'
  Set-Content IMPLEMENTATION_PLAN.md ($c.Substring(0, $s) + $block + $c.Substring($e)) -NoNewline
  ```
- Never skip checking the current plan state before starting new work.

---

## Angular Conventions

### Version & Module System

- **Angular 21.2**, strict TypeScript (`strict: true` in `tsconfig.json`).
- **Standalone components only** — never use NgModules. Every component has `standalone: true`.
- All providers live in `src/app/app.config.ts` via `provideX()` functions.

### Component Pattern

```ts
import { Component, input, output, signal, computed, inject } from '@angular/core';

@Component({
  selector: 'app-my-component',
  standalone: true,
  imports: [
    /* only what this component uses */
  ],
  template: `...`, // inline templates preferred for components < ~80 lines of HTML
})
export class MyComponent {
  // Inputs use the new signal-based API
  readonly myInput = input.required<string>();
  readonly optionalInput = input(false); // default value in parens

  // Outputs use output()
  readonly myEvent = output<string>();

  // Internal state
  private readonly count = signal(0);
  readonly doubled = computed(() => this.count() * 2);

  // Injection
  private readonly myService = inject(MyService);
}
```

- Use `input()` / `input.required()` — **never** `@Input()`.
- Use `output()` — **never** `@EventEmitter` / `@Output()`.
- Use `signal()` / `computed()` for local state — **never** `BehaviorSubject` inside components.
- Use `inject()` — **never** constructor injection.

### Services

- All services are `providedIn: 'root'` (tree-shakeable singletons).
- Use `inject()` — never constructor injection.
- Async operations return `Observable` (not `Promise`) unless the caller is a one-shot browser API.
- Use `signal()` for reactive service state exposed to templates.

### Control Flow

Use Angular 17+ block syntax — **never** `*ngIf` / `*ngFor` / `*ngSwitch`:

```html
@if (condition) { ... } @for (item of list(); track item.id) { ... } @switch (val()) { @case ('a') {
... } }
```

### Routing

- All view routes lazy-load via `loadComponent` in `src/app/app.routes.ts`.
- Route paths: `''`, `'generate'`, `'investigation'`, `'evidence-board'`, `'accusation'`, `'reveal'`.
- `**` redirects to `''`.

---

## Folder Structure

```
src/app/
  app.config.ts          — providers (HttpClient, Router, Animations)
  app.routes.ts          — all lazy routes
  app.ts / app.html      — root shell (RouterOutlet + ToastComponent)
  models/                — TypeScript interfaces only, no logic
    index.ts             — barrel re-export for all models
  services/              — injectable services
  components/            — reusable shared components
    index.ts             — barrel re-export for all components
  views/                 — full-page routed views (one folder per route)
  utils/                 — pure functions, no Angular dependencies
src/environments/
  environment.ts         — production (empty API key)
  environment.development.ts  — dev (real key, gitignored)
```

---

## Tailwind CSS v4 Conventions

This project uses **Tailwind CSS v4** with `@tailwindcss/postcss`.

### CSS Variable Shorthand (CRITICAL)

Tailwind v4 uses `(--token)` syntax — **never** the v3 `[var(--token)]` form:

| ❌ Old (v3, will warn)          | ✅ Correct (v4)            |
| ------------------------------- | -------------------------- |
| `bg-[var(--color-surface)]`     | `bg-(--color-surface)`     |
| `text-[var(--color-accent)]`    | `text-(--color-accent)`    |
| `border-[var(--color-primary)]` | `border-(--color-primary)` |

### Arbitrary Value Shortcuts

Prefer canonical Tailwind scale values over arbitrary brackets when equivalent:

| ❌ Avoid        | ✅ Prefer    |
| --------------- | ------------ |
| `min-h-[4rem]`  | `min-h-16`   |
| `min-h-[400px]` | `min-h-100`  |
| `pl-[3.75rem]`  | `pl-15`      |
| `-left-[9px]`   | `-left-2.25` |
| `z-[200]`       | `z-200`      |
| `flex-shrink-0` | `shrink-0`   |

### Inline Styles for Dynamic Values

Use `style="..."` or `[style.property]="..."` for values that come from runtime data (e.g. theme colors), **not** Tailwind classes:

```html
<!-- Dynamic — use inline style -->
<div [style.border-color]="'var(--color-accent)'">
  <!-- Static token — use Tailwind canonical class -->
  <div class="border-(--color-accent)"></div>
</div>
```

### Entry Point

`src/styles.css` starts with `@import 'tailwindcss'`. Do not add a `tailwind.config.*` file — v4 is config-free.

---

## CSS Custom Properties (Theme System)

Defined in `:root` in `src/styles.css`. `ThemeService` overrides them at runtime per case.

| Variable             | Default                          | Purpose                            |
| -------------------- | -------------------------------- | ---------------------------------- |
| `--color-primary`    | `#1a1a2e`                        | Page background                    |
| `--color-secondary`  | `#16213e`                        | Panel / card background            |
| `--color-accent`     | `#c9a84c`                        | Gold highlights, headings, borders |
| `--color-surface`    | `#0f0f23`                        | Elevated surfaces                  |
| `--color-text`       | `#e8e0d0`                        | Body text                          |
| `--color-text-muted` | `#9e9e8e`                        | Secondary / placeholder text       |
| `--font-heading`     | Playfair Display / Georgia       | Headings                           |
| `--font-body`        | Special Elite / Courier New      | Body copy                          |
| `--font-mono`        | Courier Prime                    | Monospace / UI labels              |
| `--border-style`     | `1px solid rgba(201,168,76,0.3)` | Default border                     |
| `--shadow-style`     | `0 4px 24px rgba(0,0,0,0.6)`     | Default shadow                     |

Texture overlays are activated by setting `data-texture="paper|grain|cork|metal|leather|fabric|pixel_noise"` on `<body>` via `ThemeService.applyTexture()`.

---

## Data Models

All models live in `src/app/models/` as pure TypeScript interfaces (no classes, no decorators).
Import from the barrel: `import { CasePackage, Suspect, Clue } from '../models'`.

Key types:

- `CasePackage` — root object returned by Gemini; contains all sub-models
- `GameState` — runtime player progress, persisted to `localStorage`
- `UITheme` — colors + texture family applied by `ThemeService`
- `InvestigationEvent` — nodes in the event graph with `unlockConditions`
- `UnlockCondition` — `type: 'event_completed' | 'clue_found' | 'act_reached'`

**`Location` name conflict**: Angular's `@angular/common` exports a `Location` service. Always import the game model aliased:

```ts
import { Location as GameLocation } from '../../models';
```

---

## API & Environment

- **LLM**: Gemma 3 27B via `generativelanguage.googleapis.com` — `generateContent` endpoint.
- **Images**: Imagen 4 Fast via `generativelanguage.googleapis.com` — `predict` endpoint.
- **Single key**: Both use `environment.geminiApiKey` sent as `x-goog-api-key` header.
- **Never** hardcode keys. Never commit `environment.development.ts` (it's gitignored).
- Paste your key in `src/environments/environment.development.ts` locally only.

### Gemini Request Shapes

LLM (`LlmService`):

```ts
{
  systemInstruction: { parts: [{ text: '...' }] },
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  generationConfig: { temperature: 0.9, maxOutputTokens: 8192, responseMimeType: 'application/json' }
}
// Response: candidates[0].content.parts[0].text
```

Image (`ImageService`):

```ts
{ instances: [{ prompt }], parameters: { sampleCount: 1 } }
// Response: predictions[0].bytesBase64Encoded + predictions[0].mimeType
```

---

## Services Summary

| Service            | File                                | Key API                                                                                            |
| ------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `LlmService`       | `services/llm.service.ts`           | `generateCasePackage(difficulty, style): Observable<CasePackage>`                                  |
| `ImageService`     | `services/image.service.ts`         | `generateImage(prompt): Observable<string>`, `generateAllCaseImages(pkg): Observable<CasePackage>` |
| `GameStateService` | `services/game-state.service.ts`    | Signal-based state, `localStorage` persistence, all player actions                                 |
| `CaseStoreService` | `services/case-store.service.ts`    | IndexedDB persistence for full `CasePackage`                                                       |
| `ThemeService`     | `services/theme.service.ts`         | `applyTheme(UITheme)`, `applyTexture(family)`, `resetTheme()`                                      |
| `ToastService`     | `components/toast/toast.service.ts` | `show(message, type)` — auto-dismisses after 3 s                                                   |

---

## Shared Components Summary

All importable from `src/app/components/index.ts`.

| Component                | Selector               | Key inputs / outputs                                           |
| ------------------------ | ---------------------- | -------------------------------------------------------------- |
| `LoadingScreenComponent` | `<app-loading-screen>` | `message` input (optional; auto-rotates flavor text if absent) |
| `ClueCardComponent`      | `<app-clue-card>`      | `clue` (required), `showTruth`                                 |
| `SuspectCardComponent`   | `<app-suspect-card>`   | `suspect` (required), `isInterviewed`; emits `cardClicked`     |
| `LocationCardComponent`  | `<app-location-card>`  | `location` (required), `isVisited`; emits `cardClicked`        |
| `TimelineComponent`      | `<app-timeline>`       | `events` (required), `revealTruth`                             |
| `DialogueBoxComponent`   | `<app-dialogue-box>`   | `lines` (required); emits `dialogueClosed`                     |
| `PuzzleFrameComponent`   | `<app-puzzle-frame>`   | `puzzle` (required); emits `puzzleSolved` (clue ID)            |
| `ToastComponent`         | `<app-toast>`          | No inputs — reads from `ToastService`. Already in `app.html`.  |
| `ActBannerComponent`     | `<app-act-banner>`     | `act`, `title`, `summary` (all required); emits `dismissed`    |

---

## Security Notes

- `PuzzleFrameComponent` uses `DomSanitizer.bypassSecurityTrustHtml` for the puzzle iframe `srcdoc`. This is safe because the iframe has `sandbox="allow-scripts"` with **no** `allow-same-origin` — the puzzle HTML cannot access parent DOM, cookies, or storage.
- Never add `allow-same-origin` to the puzzle iframe sandbox.
- Never commit API keys. The `x-goog-api-key` header is set only in `LlmService` and `ImageService`, which read from `environment`.
