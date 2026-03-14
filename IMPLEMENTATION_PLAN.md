# The Last Alibi – Implementation Plan & Checklist

> **How to use this file:** Work through each phase top-to-bottom. Check off `[ ]` items as they are completed by changing them to `[x]`. Return to this file at the start of every work session to resume from where you left off. Do not skip phases unless explicitly noted.

---

## Phase 0 – Project Foundation

### 0.1 Angular Project Cleanup & Setup
- [x] Review and clean the default Angular scaffold (`app.ts`, `app.html`, `app.css`, `app.routes.ts`)
- [x] Remove all boilerplate content from `app.html`
- [x] Set up global `styles.css` with CSS reset and base font/color variables
- [x] Add Angular standalone component pattern confirmation in `app.config.ts`
- [x] Install and configure `@angular/animations` if not already included (needed for transitions)
- [x] Verify `tsconfig.json` has strict mode enabled
- [x] Install Tailwind CSS v4 (`tailwindcss`, `@tailwindcss/postcss`) and create `postcss.config.mjs`

### 0.2 Folder Structure
- [x] Create `src/app/core/` — singleton services, models, constants
- [x] Create `src/app/models/` — all TypeScript interfaces and types
- [x] Create `src/app/services/` — data services, LLM service, state service
- [x] Create `src/app/components/` — reusable UI components
- [x] Create `src/app/views/` — full-page routed views/screens
- [x] Create `src/app/utils/` — pure helper functions
- [x] Create `src/assets/textures/` — texture image files (paper, cork, grain, metal, leather)
- [x] Create `src/assets/fonts/` — any custom fonts used for noir/detective theme

### 0.3 Routing Setup
- [x] Define routes in `app.routes.ts`:
  - `/` → `HomeView` (start screen)
  - `/generate` → `GenerateView` (case generation loading screen)
  - `/investigation` → `InvestigationView` (main gameplay)
  - `/accusation` → `AccusationView` (final accusation form)
  - `/reveal` → `RevealView` (solution reveal screen)
  - `**` → redirect to `/`
- [x] Enable lazy loading for all view components
- [x] Added `/evidence-board` route → `EvidenceBoardView`

### 0.4 Environment & API Key Setup
- [x] Create `src/environments/environment.ts` and `environment.development.ts`
- [x] Add `llmApiKey` and `llmApiEndpoint` fields to environment files
- [x] Add `imageApiKey` and `imageApiEndpoint` fields (for image generation, can be same as LLM)
- [ ] Document in `README.md` how to supply API keys via environment files (do NOT commit keys)
- [x] Add `environment.development.ts` to `.gitignore`
- [x] Wire `fileReplacements` in `angular.json` development configuration

---

## Phase 1 – Data Models

> All game data is defined as TypeScript interfaces before any logic is written. This is the single source of truth for the entire application.

### 1.1 Core Case Package Model
- [x] Create `src/app/models/case-package.model.ts`
- [x] Define `CasePackage` interface with fields:
  - `id: string` — unique session ID (UUID)
  - `metadata: CaseMetadata`
  - `truth: TruthLayer`
  - `suspects: Suspect[]`
  - `locations: Location[]`
  - `clues: Clue[]`
  - `timeline: TimelineEvent[]`
  - `eventGraph: InvestigationEvent[]`
  - `puzzles: PuzzleEvent[]`
  - `hintLadder: Hint[]`
  - `solutionExplanation: SolutionExplanation`
  - `visualDirection: VisualDirection`
  - `uiTheme: UITheme`
  - `imagePromptTemplates: ImagePromptTemplates`
  - `generatedAt: string` — ISO timestamp

### 1.2 Case Metadata Model
- [x] Create `CaseMetadata` interface:
  - `title: string`
  - `subtitle: string`
  - `caseType: 'murder' | 'theft' | 'disappearance' | 'sabotage' | 'other'`
  - `difficulty: 'easy' | 'normal' | 'hard' | 'genius'`
  - `setting: string` — e.g. "1940s countryside manor"
  - `briefing: string` — introductory text shown to player
  - `act1Summary: string`
  - `act2Summary: string`
  - `act3Summary: string`

### 1.3 Truth Layer Model
- [x] Create `TruthLayer` interface:
  - `culpritId: string` — references `Suspect.id`
  - `motive: string`
  - `method: string`
  - `trueTimeline: string`
  - `keyContradiction: string`
  - `importantClueId: string` — references `Clue.id`
  - `redHerringExplanation: string`
  - `lyingSuspectIds: string[]`
  - `mistakenSuspectIds: string[]`
  - `hidingSecretSuspectIds: string[]`
  - `revealingClueIds: string[]`
  - `redHerringClueIds: string[]`

### 1.4 Suspect Model
- [x] Create `Suspect` interface:
  - `id: string`
  - `name: string`
  - `age: number`
  - `occupation: string`
  - `relationship: string` — relationship to victim/case
  - `description: string`
  - `personality: string`
  - `alibi: string`
  - `secretUnrelatedToCase: string`
  - `isLying: boolean`
  - `isMistaken: boolean`
  - `isHidingSecret: boolean`
  - `interviewDialogue: DialogueLine[]`
  - `imagePrompt: string`
  - `imageUrl?: string` — populated after image generation

### 1.5 Location Model
- [x] Create `Location` interface:
  - `id: string`
  - `name: string`
  - `description: string`
  - `atmosphere: string`
  - `cluesFoundHere: string[]` — array of `Clue.id`
  - `imagePrompt: string`
  - `imageUrl?: string`

### 1.6 Clue Model
- [x] Create `Clue` interface:
  - `id: string`
  - `name: string`
  - `description: string`
  - `locationId: string`
  - `isRedHerring: boolean`
  - `revealsInfo: string` — what the player learns from this clue
  - `imagePrompt: string`
  - `imageUrl?: string`

### 1.7 Timeline Event Model
- [x] Create `TimelineEvent` interface:
  - `id: string`
  - `time: string` — e.g. "8:45 PM"
  - `description: string`
  - `involvedSuspectIds: string[]`
  - `isTrue: boolean` — false = part of the deception

### 1.8 Investigation Event Graph Model
- [x] Create `InvestigationEvent` interface:
  - `id: string`
  - `category: 'investigation' | 'social' | 'surprise' | 'puzzle' | 'deduction'`
  - `type: string` — e.g. "inspect_crime_scene", "suspect_interview"
  - `title: string`
  - `description: string`
  - `act: 1 | 2 | 3`
  - `isMandatory: boolean`
  - `unlockConditions: UnlockCondition[]`
  - `rewardsClueIds: string[]`
  - `unlocksSuspectIds: string[]`
  - `puzzleId?: string`
  - `dialogueSuspectId?: string`
  - `narration: string` — flavor text shown when event triggers
  - `isCompleted: boolean` — runtime state (not in generated package)

### 1.9 Puzzle Event Model
- [x] Create `PuzzleEvent` interface:
  - `id: string`
  - `type: 'cipher' | 'lock' | 'pattern' | 'fragment' | 'logic_grid' | 'sequence' | 'map' | 'mechanical'`
  - `title: string`
  - `description: string`
  - `htmlComponent: string` — raw HTML/JS/CSS puzzle rendered in sandboxed iframe
  - `solutionCondition: string` — description of how the puzzle is solved
  - `rewardedClueId: string`
  - `hints: string[]`

### 1.10 Visual Direction Model
- [x] Create `VisualDirection` interface:
  - `artStyle: string` — e.g. "noir illustration", "pixel art"
  - `mood: string`
  - `colorPalette: string[]` — array of hex colors
  - `lightingStyle: string`
  - `renderingStyle: string`
  - `globalStylePrompt: string` — used as prefix for all image prompts
  - `negativePrompt: string`

### 1.11 UI Theme Model
- [x] Create `UITheme` interface:
  - `primaryColor: string`
  - `secondaryColor: string`
  - `accentColor: string`
  - `surfaceColor: string`
  - `textColor: string`
  - `panelStyle: 'flat' | 'raised' | 'inset'`
  - `borderStyle: string` — CSS border shorthand
  - `shadowStyle: string` — CSS box-shadow shorthand
  - `textureFamily: 'paper' | 'grain' | 'cork' | 'metal' | 'leather' | 'fabric' | 'pixel_noise'`

### 1.12 Image Prompt Templates Model
- [x] Create `ImagePromptTemplates` interface:
  - `suspectPortrait: string` — template with `{{name}}`, `{{description}}` placeholders
  - `locationScene: string`
  - `clueObject: string`
  - `eventSplash: string`
  - `puzzleObject: string`

### 1.13 Dialogue & Hint Models
- [x] Create `DialogueLine` interface: `{ speakerId: string, speakerName: string, text: string, revealsTruth: boolean }`
- [x] Create `Hint` interface: `{ index: number, text: string, targetsEventId?: string }`
- [x] Create `SolutionExplanation` interface: `{ narrative: string, stepsExplained: string[], redHerringExplanations: string[] }`
- [x] Create `UnlockCondition` interface: `{ type: 'event_completed' | 'clue_found' | 'act_reached', referenceId: string }`

### 1.14 Game State Model
- [x] Create `src/app/models/game-state.model.ts`
- [x] Define `GameState` interface:
  - `sessionId: string`
  - `completedEventIds: string[]`
  - `visitedLocationIds: string[]`
  - `foundClueIds: string[]`
  - `completedPuzzleIds: string[]`
  - `interviewedSuspectIds: string[]`
  - `unlockedSuspectIds: string[]`
  - `currentAct: 1 | 2 | 3`
  - `actionsCount: number`
  - `isAccusationUnlocked: boolean`
  - `finalAccusation?: FinalAccusation`
  - `evidenceBoardNotes: EvidenceBoardNote[]`
  - `hintsUsed: number`
- [x] Define `FinalAccusation` interface: `{ culpritId: string, motive: string, method: string, evidenceIds: string[] }`
- [x] Define `EvidenceBoardNote` interface: `{ id: string, text: string, x: number, y: number, connectedToIds: string[] }`

---

## Phase 2 – Core Services

### 2.1 LLM Service
- [x] Create `src/app/services/llm.service.ts`
- [x] Implement `generateCasePackage(difficulty, stylePreference): Observable<CasePackage>`
- [x] Build the master prompt that instructs the LLM to return a valid JSON `CasePackage`
- [x] Implement prompt sections in separate private methods (one per section) for maintainability:
  - `buildTruthPrompt()`
  - `buildSuspectsPrompt()`
  - `buildLocationsPrompt()`
  - `buildCluesPrompt()`
  - `buildEventGraphPrompt()`
  - `buildPuzzlesPrompt()`
  - `buildVisualDirectionPrompt()`
  - `buildUIThemePrompt()`
- [x] Implement JSON response parsing with error catching
- [x] Implement retry logic (max 2 retries) if JSON parsing fails
- [x] Add response validation to ensure required fields are present

### 2.2 Image Generation Service
- [x] Create `src/app/services/image.service.ts`
- [x] Implement `generateImage(prompt: string): Observable<string>` returning a base64 data URL or hosted URL
- [x] Implement `generateAllCaseImages(casePackage: CasePackage): Observable<CasePackage>` — batch generates all images and populates `imageUrl` fields
- [x] Add placeholder/fallback for when image generation is unavailable (use CSS-generated placeholders)
- [x] Implement a queue so that images are generated progressively and do not block gameplay start

### 2.3 Game State Service
- [x] Create `src/app/services/game-state.service.ts`
- [x] Implement `initState(sessionId: string): void`
- [x] Implement `saveState(state: GameState): void` — persists to `localStorage`
- [x] Implement `loadState(sessionId: string): GameState | null`
- [x] Implement `clearState(): void`
- [x] Implement `getAvailableEvents(casePackage: CasePackage, state: GameState): InvestigationEvent[]` — evaluates unlock conditions
- [x] Implement `completeEvent(eventId: string): void`
- [x] Implement `discoverClue(clueId: string): void`
- [x] Implement `completePuzzle(puzzleId: string): void`
- [x] Implement `visitLocation(locationId: string): void`
- [x] Implement `interviewSuspect(suspectId: string): void`
- [x] Implement `advanceAct(): void` — moves game to next act when conditions are met
- [x] Implement `unlockAccusation(): void`
- [x] Implement `submitAccusation(accusation: FinalAccusation): boolean` — returns true if correct

### 2.4 Case Store Service
- [x] Create `src/app/services/case-store.service.ts`
- [x] Implement `storeCase(casePackage: CasePackage): void` — saves to `localStorage` or `IndexedDB`
- [x] Implement `loadCase(sessionId: string): CasePackage | null`
- [x] Implement `deleteCase(sessionId: string): void`
- [x] Implement `listSavedCases(): { id: string, title: string, savedAt: string }[]`
- [x] Use `IndexedDB` via a thin wrapper for large case packages (avoid localStorage size limits)

### 2.5 Theme Service
- [x] Create `src/app/services/theme.service.ts`
- [x] Implement `applyTheme(theme: UITheme): void` — injects CSS variables onto `:root`
- [x] Define CSS variable names: `--color-primary`, `--color-secondary`, `--color-accent`, `--color-surface`, `--color-text`, `--border-style`, `--shadow-style`
- [x] Implement `applyTexture(textureFamily: UITheme['textureFamily']): void` — sets body data-attribute mapped to CSS texture class
- [x] Implement `resetTheme(): void`

---

## Phase 3 – Shared UI Components

> These components are reused across multiple views.

### 3.1 Loading Screen Component
- [x] Create `src/app/components/loading-screen/`
- [x] Display animated loading indicator with flavor text (e.g. "Gathering evidence...", "Questioning witnesses...")
- [x] Accept `@Input() message: string`
- [x] Animate text changes with fade transition

### 3.2 Clue Card Component
- [x] Create `src/app/components/clue-card/`
- [x] Display clue name, description, location, and optional image
- [x] Show "Red Herring" badge only after reveal phase
- [x] Accept `@Input() clue: Clue` and `@Input() showTruth: boolean`

### 3.3 Suspect Card Component
- [x] Create `src/app/components/suspect-card/`
- [x] Display suspect portrait (image or placeholder), name, occupation, and brief description
- [x] Clicking opens the interview dialogue for that suspect
- [x] Accept `@Input() suspect: Suspect` and `@Input() isInterviewed: boolean`

### 3.4 Location Card Component
- [x] Create `src/app/components/location-card/`
- [x] Display location image or placeholder, name, and atmosphere
- [x] Clicking triggers the investigation event for that location
- [x] Accept `@Input() location: Location` and `@Input() isVisited: boolean`

### 3.5 Timeline Component
- [x] Create `src/app/components/timeline/`
- [x] Render a vertical list of `TimelineEvent` entries
- [x] Show only the events the player has unlocked so far
- [x] Mark conflicting/false entries visually after truth is revealed

### 3.6 Dialogue Box Component
- [x] Create `src/app/components/dialogue-box/`
- [x] Display suspect name and dialogue lines in sequence (click-to-advance)
- [x] Style as a speech bubble or bordered panel matching the session theme
- [x] Accept `@Input() lines: DialogueLine[]` and `@Output() dialogueClosed: EventEmitter<void>`

### 3.7 Puzzle Frame Component
- [x] Create `src/app/components/puzzle-frame/`
- [x] Render puzzle `htmlComponent` inside a sandboxed `<iframe sandbox="allow-scripts">`
- [x] Listen for `window.postMessage` from the iframe to detect puzzle completion
- [x] On completion: emit `puzzleSolved` event and display reward clue
- [x] Accept `@Input() puzzle: PuzzleEvent` and `@Output() puzzleSolved: EventEmitter<string>` (clue ID)

### 3.8 Notification / Toast Component
- [x] Create `src/app/components/toast/`
- [x] Display short notifications: "New clue discovered!", "Suspect unlocked!", "New area available"
- [x] Auto-dismiss after 3 seconds
- [x] Stack multiple toasts gracefully

### 3.9 Act Banner Component
- [x] Create `src/app/components/act-banner/`
- [x] Display a full-screen animated banner when the player advances to a new act
- [x] Show act title and brief description from `CaseMetadata`

---

## Phase 4 – Views / Screens

### 4.1 Home View
- [ ] Create `src/app/views/home-view/`
- [ ] Show game title "The Last Alibi" with styled header
- [ ] "New Case" button — navigates to Generate View
- [ ] "Continue" button — visible only if a saved session exists in storage; loads existing case
- [ ] Difficulty selector: Easy / Normal / Hard / Genius
- [ ] Visual style selector: dropdown with art styles OR "Surprise Me" option
- [ ] Brief tagline/description of the game

### 4.2 Generate View
- [ ] Create `src/app/views/generate-view/`
- [ ] Show loading screen with rotating flavor messages while LLM generates the case package
- [ ] Call `LLMService.generateCasePackage()` on component init
- [ ] Store generated package via `CaseStoreService`
- [ ] Initialize game state via `GameStateService`
- [ ] Apply session theme via `ThemeService`
- [ ] Kick off background image generation via `ImageService`
- [ ] Navigate to `/investigation` on completion
- [ ] Display error state with retry option if generation fails

### 4.3 Investigation View (Main Gameplay)
- [ ] Create `src/app/views/investigation-view/`
- [ ] Layout: left sidebar + main content area + right panel (responsive)
- [ ] **Left sidebar:** Active suspects list (unlocked), hint button, act progress indicator
- [ ] **Main content area:** Current scene/event, dialogue, puzzle, or clue display
- [ ] **Right panel:** Evidence board preview (click to expand), discovered clues counter
- [ ] **Top bar:** Case title, current act, actions counter, settings icon
- [ ] Load case package and game state on init
- [ ] Apply case theme on init via `ThemeService`
- [ ] Render initially available events from the event graph
- [ ] Handle event selection and route to appropriate sub-component (dialogue, puzzle, investigation)
- [ ] Show act transition banner when act advances
- [ ] Show "Make Accusation" button when accusation is unlocked
- [ ] Navigate to `/accusation` when accusation button is clicked

### 4.4 Evidence Board View
- [ ] Create `src/app/views/evidence-board-view/`  
- [ ] Render a corkboard-style canvas with positioned cards
- [ ] Display `Suspect` cards pinned to the board
- [ ] Display found `Clue` cards pinned to the board
- [ ] Allow drawing connections between cards (click source → click target draws a line)
- [ ] Allow adding text sticky notes anywhere on the board
- [ ] Allow dragging cards to reposition them
- [ ] Persist board layout in `GameState.evidenceBoardNotes`
- [ ] "Back to Investigation" button

### 4.5 Accusation View
- [ ] Create `src/app/views/accusation-view/`
- [ ] Form fields:
  - Suspect selector (dropdown of unlocked suspects with portraits)
  - Motive text area (player writes their interpretation)
  - Method text area (player describes how it was done)
  - Evidence multi-select (player selects supporting clues from found clues)
- [ ] "Submit Theory" button — calls `GameStateService.submitAccusation()`
- [ ] Show brief confirmation prompt before finalizing
- [ ] Navigate to `/reveal` after submission

### 4.6 Reveal View
- [ ] Create `src/app/views/reveal-view/`
- [ ] Show whether player's accusation was correct (correct culprit + motive + method)
- [ ] Animate the reveal of the full `SolutionExplanation.narrative`
- [ ] Step through `stepsExplained` in sequence with "Next" button
- [ ] Show `redHerringExplanations` in a separate "About the Red Herrings" section
- [ ] Re-display timeline now with all events marked true/false
- [ ] Show all clues with truth status revealed
- [ ] "Play Again" button — clears state and returns to Home View

---

## Phase 5 – Evidence Board (Detailed Implementation)

### 5.1 Canvas & Positioning
- [ ] Use an absolutely positioned `div` container as the board canvas
- [ ] Store card positions as `{ x: number, y: number }` in game state
- [ ] Implement drag-and-drop using Angular's `CDK DragDrop` or native pointer events
- [ ] Ensure cards stay within board bounds

### 5.2 Connection Lines
- [ ] Use an `<svg>` overlay covering the full board canvas for drawing lines
- [ ] Store connections as pairs of card IDs in game state
- [ ] Render an `<line>` SVG element for each connection pair using card center coordinates
- [ ] Allow removing a connection by clicking its midpoint

### 5.3 Notes
- [ ] Implement sticky note component: double-click blank board area to create a note
- [ ] Note is an editable `<textarea>` that saves on blur
- [ ] Notes are draggable like cards
- [ ] Notes stored in `GameState.evidenceBoardNotes`

### 5.4 Contradiction Markers
- [ ] After the player discovers a contradiction (deduction event), add a red marker icon to relating cards
- [ ] Show tooltip explaining the contradiction on hover

---

## Phase 6 – Puzzle System (Detailed Implementation)

### 6.1 Sandboxed Iframe Rendering
- [ ] Puzzle `htmlComponent` is injected as the `srcdoc` attribute of a sandboxed iframe
- [ ] Sandbox attribute: `sandbox="allow-scripts"` only — no allow-same-origin, no allow-forms
- [ ] Puzzle HTML must call `window.parent.postMessage({ type: 'PUZZLE_SOLVED', puzzleId: '...' }, '*')` on completion
- [ ] Game component listens for this message and validates the `puzzleId` matches current puzzle

### 6.2 Puzzle LLM Prompt
- [ ] Design a specific sub-prompt for puzzle generation requesting self-contained HTML
- [ ] Specify that all CSS and JS must be inline within the HTML string
- [ ] Specify the postMessage protocol in the prompt
- [ ] Include type hints and constraints (no external fetch calls, no localStorage)

### 6.3 Puzzle UI Wrapper
- [ ] Puzzle frame shows title and description above iframe
- [ ] Show "Need a hint?" button — reveals next hint from `PuzzleEvent.hints`
- [ ] Show reward clue preview (blurred) to motivate completion
- [ ] On puzzle completion: animate reward clue reveal

---

## Phase 7 – Session Generation Prompt Engineering

### 7.1 Master Prompt Design
- [ ] Write the full master system prompt for case generation
- [ ] Instruct the LLM to return a single valid JSON object (no markdown fences)
- [ ] Include the full `CasePackage` schema as a comment or JSON schema in the prompt
- [ ] Include constraints:
  - All `id` fields must be unique strings
  - `truthLayer.culpritId` must reference a real `Suspect.id`
  - `truthLayer.importantClueId` must reference a real `Clue.id`
  - Event unlock conditions must not create circular dependencies
  - At least 3 suspects, at least 2 locations, at least 4 clues required
  - At least 1 clue must be a red herring
  - Puzzles must be self-contained HTML

### 7.2 Prompt Parameterization
- [ ] Inject `difficulty` into the prompt to scale complexity
- [ ] Inject `stylePreference` (art style) into the visual direction section
- [ ] Allow an `era` or `genre` injected parameter for setting flavor (e.g. "1920s Paris", "futuristic space station")

### 7.3 Response Validation
- [ ] After parsing LLM response, validate that all cross-references (IDs) are consistent
- [ ] If validation fails, attempt correction with a follow-up prompt
- [ ] Log all validation failures for debugging

---

## Phase 8 – Theming & Visual Polish

### 8.1 CSS Variables System
- [ ] Define all theme CSS variables in `styles.css` with defaults
- [ ] Ensure all component styles use `var(--color-*)` instead of hardcoded colors
- [ ] `ThemeService.applyTheme()` sets CSS variables on `:root` element

### 8.2 Texture Overlays
- [ ] Add texture image assets to `src/assets/textures/` (paper, cork, grain, metal, leather)
- [ ] Define CSS classes `.texture-paper`, `.texture-cork`, `.texture-grain`, etc.
- [ ] Each class applies the texture as a `::before` pseudo-element with low opacity (0.05–0.15)
- [ ] Body gets a `data-texture` attribute set by `ThemeService`, which activates matching texture class

### 8.3 Typography
- [ ] Import 2–3 Google Fonts suitable for detective/noir aesthetic (e.g. Playfair Display, Special Elite, Courier Prime)
- [ ] Map `artStyle` values to specific font pairings
- [ ] Apply fonts via CSS variables: `--font-heading`, `--font-body`, `--font-mono`

### 8.4 Animations
- [ ] Page transition fade on route changes
- [ ] Clue card flip animation on discovery
- [ ] Suspect card slide-in on unlock
- [ ] Dialogue text reveal (character-by-character or line fade)
- [ ] Act banner cinematic entrance animation

### 8.5 Responsive Layout
- [ ] Investigation View adapts: sidebar collapses to drawer on mobile
- [ ] Evidence board uses full-screen view on mobile
- [ ] Cards are touch-draggable on mobile devices

---

## Phase 9 – Hint System

- [ ] Implement `HintService` or integrate hints into `GameStateService`
- [ ] Track `GameState.hintsUsed` — gate number of available hints per act
- [ ] "Request Hint" button in Investigation View sidebar
- [ ] On click: reveal the next hint in the `CasePackage.hintLadder` sequence
- [ ] Hints are displayed in a modal with a slight delay to build tension
- [ ] Bonus: show a "cost" for hints (e.g. deducts "detective rating")

---

## Phase 10 – Scoring & Detective Rating

- [ ] Define scoring formula:
  - Base score: 1000 points
  - Deduct: 50 points per hint used
  - Deduct: 10 points per incorrect suspect interviewed (over minimum)
  - Deduct: 100 points if wrong culprit initially chosen
  - Add: 200 points for identifying all red herrings explicitly
- [ ] Calculate rating after final accusation
- [ ] Map score to letter grade: S / A / B / C / F
- [ ] Display score and grade on the Reveal View

---

## Phase 11 – Saved Cases & Session Management

- [ ] Home View shows list of saved cases from `CaseStoreService.listSavedCases()`
- [ ] Each saved case shows: title, case type, difficulty, date saved, and continue button
- [ ] "Delete Case" option per saved case (with confirmation)
- [ ] New case warns if a case is already in progress

---

## Phase 12 – End-to-End Testing & QA

### 12.1 Unit Tests
- [ ] Write unit tests for `GameStateService` — event unlock logic
- [ ] Write unit tests for `GameStateService.submitAccusation()` correctness check
- [ ] Write unit tests for `CaseStoreService` — save/load round trip
- [ ] Write unit tests for `ThemeService` — CSS variable application

### 12.2 Integration Tests
- [ ] Test full Generate View flow with a mocked LLM response (use a pre-baked fixture `CasePackage`)
- [ ] Test puzzle completion postMessage flow
- [ ] Test accusation form submission and navigation to Reveal View

### 12.3 Manual QA Checklist
- [ ] Play through a full case from Home to Reveal on Normal difficulty
- [ ] Verify all cross-reference IDs in a generated case package are consistent
- [ ] Verify evidence board save/load persists across page refresh
- [ ] Verify puzzle iframe is properly sandboxed (cannot access parent DOM)
- [ ] Verify theme CSS variables correctly override styles in all views
- [ ] Verify responsive layout on mobile viewport

---

## Phase 13 – Polish & Nice-to-Haves

> Only work on these after Phases 0–12 are complete.

- [ ] Ambient sound toggle (typewriter clicks, jazz background, rain ambience)
- [ ] Cinematic intro animation on case start (title card, case subtitle)
- [ ] "Detective Notebook" sidebar panel — running log of all discovered clues and notes
- [ ] Export case summary as PDF after Reveal
- [ ] Share case seed — encode `CasePackage` as a compressed URL parameter so others can play the same case
- [ ] Dark mode / light mode toggle independent of session theme
- [ ] Settings page: LLM model selector, temperature slider for generation creativity
- [ ] Accessibility audit: ARIA labels, keyboard navigation, sufficient color contrast

---

## Quick Reference

### Key Files by Phase
| Phase | Files Created |
|-------|--------------|
| 0 | `app.routes.ts`, `environments/`, folder structure |
| 1 | `src/app/models/*.model.ts` |
| 2 | `src/app/services/*.service.ts` |
| 3 | `src/app/components/*/` |
| 4 | `src/app/views/*/` |
| 5–6 | Evidence board & puzzle implementations inside views |
| 7 | Prompt strings inside `LLMService` |
| 8 | `styles.css`, `assets/textures/`, theme variables |

### LLM API Notes
- Model: Use any OpenAI-compatible API (GPT-4o recommended for JSON output reliability)
- Set `response_format: { type: 'json_object' }` to force JSON output
- Typical case generation: 1–2 API calls (one for full package, optionally one for puzzles)
- Image generation: separate API (DALL-E 3 or equivalent), called per image after case is generated

### Angular Standalone Component Pattern (No NgModules)
- All components use `standalone: true`
- Imports are declared per-component
- Routing uses the `provideRouter()` function in `app.config.ts`

---

*Last updated: Phase 3 — Complete ✓ (Phase 4 next)*
