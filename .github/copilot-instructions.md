# The Last Alibi - Copilot Instructions

Read this file before making code changes. Keep it aligned with the repo as it exists now, not with an older plan or an imagined target architecture.

---

## Start Here

- Check `IMPLEMENTATION_PLAN.md` at the start of every work session.
- Only mark checklist items complete if your work actually finished them.
- If you touch the case-generation pipeline, read `MULTI_STEP_GENERATION_ARCHITECTURE.md` first.
- Treat `README.md` as mostly Angular CLI boilerplate unless you have updated it yourself.

---

## Project Snapshot

- Angular 21 standalone SPA, strict TypeScript, npm workspace.
- Main scripts:
  - `npm start` -> `ng serve --open`
  - `npm run build` -> `ng build`
  - `npm test` -> `ng test`
- Unit tests use Vitest types (`vitest/globals`), not Jasmine or Jest idioms.
- App routes are defined in `src/app/app.routes.ts` and lazy-load these views:
  - `''`
  - `'generate'`
  - `'investigation'`
  - `'evidence-board'`
  - `'accusation'`
  - `'reveal'`
- Global providers live in `src/app/app.config.ts`.
- The root shell is `src/app/app.ts` plus `app.html` and `app.css`.

---

## Angular Rules

- Standalone components only. Do not introduce NgModules.
- Prefer `input()`, `input.required()`, and `output()` over decorator-based inputs and outputs.
- Prefer `signal()` and `computed()` for local UI state.
- Prefer `inject()` over constructor injection in new or substantially refactored code.
- Keep service APIs asynchronous with `Observable` unless you are wrapping a one-shot browser API.
- Use Angular block syntax: `@if`, `@for`, `@switch`. Do not introduce `*ngIf`, `*ngFor`, or `*ngSwitch`.
- Prefer `host` metadata over `@HostBinding` and `@HostListener` in new code. Some existing files still use the older pattern; do not copy that forward unless you are only making a minimal local edit.
- Prefer inline templates for small components. The root shell may continue using external template/style files.
- Import only what the component actually uses.
- When creating or heavily refactoring components, prefer `ChangeDetectionStrategy.OnPush`. Do not churn neighboring files solely to add it.
- Prefer reactive forms over template-driven forms.
- Prefer class and style bindings over `ngClass` and `ngStyle`.

---

## Styling Rules

- Tailwind CSS v4 is enabled through `@import 'tailwindcss'` in `src/styles.css`.
- Do not add a `tailwind.config.*` file unless the project explicitly changes direction.
- Use Tailwind v4 CSS variable shorthand:
  - `bg-(--color-surface)`
  - `text-(--color-accent)`
  - `border-(--color-primary)`
- Do not use the older `[var(--token)]` syntax.
- Prefer Tailwind scale utilities over arbitrary values when an equivalent exists.
- Use inline style bindings for runtime theme values instead of trying to synthesize Tailwind classes from dynamic data.
- Preserve the existing detective/noir visual language unless the user explicitly asks for a different direction.
- Theme variables are defined in `src/styles.css` and applied at runtime through `ThemeService`.
- Body textures are controlled with `data-texture` on `<body>`. Keep that contract intact.

---

## Project Structure

`src/app/models`

- Interfaces and types only. No Angular decorators or runtime logic.
- Import from the barrel when practical.

`src/app/components`

- Shared reusable UI pieces. Re-exported from `src/app/components/index.ts`.

`src/app/views`

- Route-level screens, one folder per view.

`src/app/services`

- App services for LLM generation, image generation, themeing, persistence, and game state.

`src/app/utils`

- Pure helpers without Angular dependencies.

`src/environments`

- `environment.development.ts` is the local development file and is gitignored.
- `environment.ts` is the committed default environment file.

---

## Data and Persistence

- Check the live interfaces before changing model consumers. The docs in this file are guidance, not an exhaustive schema reference.
- `CasePackage` includes generated content plus optional generated image URLs.
- `GameState` includes investigation progress plus persisted evidence-board layout and contradiction tracking.
- `GameStateService` stores runtime progress in `localStorage`.
- `CaseStoreService` stores full generated cases in IndexedDB.
- `ImageService` uses IndexedDB-backed image caching via `src/app/utils/image-cache.ts` and returns object URLs or placeholders.
- If you import the game `Location` model in a file that also touches Angular's `Location` service, alias the model as `GameLocation`.

---

## Generation Pipeline Rules

- `LlmService` is a staged generation pipeline, not a single monolithic prompt.
- Preserve step ordering, validation boundaries, and cross-reference safety between generated entities.
- If you change prompts, keep outputs machine-parseable and schema-aware.
- If you change puzzle generation, keep the HTML self-contained and compatible with the sandboxed iframe renderer.
- If you change image generation, preserve caching behavior and progressive image emission so gameplay can continue while images arrive.

---

## Security and Secrets

- Never add `allow-same-origin` to the puzzle iframe sandbox.
- `PuzzleFrameComponent` relies on `DomSanitizer.bypassSecurityTrustHtml` only because the iframe remains sandboxed with `allow-scripts` only.
- Do not hardcode, duplicate, or log API keys.
- Do not copy secrets into docs, prompts, tests, or comments.
- Read API endpoints and keys from `src/environments/environment*.ts`.
- Image generation currently goes through `imageWorkerEndpoint`; do not silently replace that transport without checking the surrounding architecture.

---

## Editing Guidance

- Prefer minimal, focused changes over large cleanups.
- Match the surrounding file style unless you are doing an intentional refactor.
- Do not treat every existing pattern as ideal. Some files contain older Angular patterns kept for local stability.
- If you touch user-facing game flow, check whether the implementation plan or architecture doc also needs updating.
- When adding tests, use the existing Angular + Vitest setup and avoid introducing a second test style.
