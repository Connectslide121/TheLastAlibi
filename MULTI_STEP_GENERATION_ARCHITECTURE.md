# The Last Alibi — Multi-Step Generation Architecture

> **Internal architecture document.** Describes the redesigned case-generation pipeline optimized for Gemma-style models, staged JSON generation, and backend validation between steps.

---

## Table of Contents

1. [Proposed Multi-Step Pipeline](#section-1)
2. [JSON Contracts Per Step](#section-2)
3. [How to Restructure for Gemma](#section-3)
4. [Prompt Strategy Per Step](#section-4)
5. [Backend Validation and Repair Strategy](#section-5)
6. [Special Handling for Puzzles](#section-6)
7. [Final Assembly Model](#section-7)
8. [Generation Order and Dependency Graph](#section-8)
9. [Failure Modes to Design Around](#section-9)

---

<a name="section-1"></a>
## Section 1 — Proposed Multi-Step Pipeline

### Overview

The old approach asked a single model call to produce ~800–2000 tokens of structured JSON spanning 14 top-level arrays and objects with dozens of cross-references. This is replaced with 10 discrete steps. Each step receives a compact, focused prompt and produces only the fields it is responsible for. The backend validates outputs after each step before proceeeding.

---

### Step 1 — Case Foundation

**Purpose:** Establish the creative skeleton of the case. Define the premise, difficulty, setting, act structure, and the hidden truth (culprit identity + motive + method). No IDs yet — suspects and clues are referenced by descriptive labels only. This prevents broken cross-references at the earliest stage.

**Required inputs:**
- `difficulty` (`easy | normal | hard | genius`)
- `stylePreference` (art style / tone string)

**Depends on:** Nothing (first step)

**Output JSON:** `CaseFoundation`

```json
{
  "caseSlug": "the-garden-party-murder",
  "title": "The Garden Party Murder",
  "subtitle": "Everyone had a reason to want him dead",
  "caseType": "murder",
  "setting": "1930s English country manor",
  "briefing": "...",
  "act1Summary": "...",
  "act2Summary": "...",
  "act3Summary": "...",
  "culpritLabel": "The jealous younger sister",
  "motive": "To reclaim the inheritance she was denied",
  "method": "Arsenic dissolved in the evening brandy",
  "trueTimeline": "...",
  "keyContradiction": "...",
  "redHerringExplanation": "...",
  "suspectLabels": ["jealous younger sister", "business partner", "wronged servant", "family lawyer", "estranged son"],
  "lyingSuspectLabels": ["business partner", "estranged son"],
  "mistakenSuspectLabels": ["wronged servant"],
  "hidingSecretSuspectLabels": ["family lawyer"]
}
```

**Backend validation after step:**
- `caseSlug` is kebab-case, unique
- `suspectLabels` contains 3–5 entries depending on difficulty
- `culpritLabel` appears in `suspectLabels`
- All truth fields present and non-empty
- `lyingSuspectLabels` entries are a strict subset of `suspectLabels`

**Can be retried independently:** Yes — no prior steps

**Mandatory:** Yes — all subsequent steps depend on this

---

### Step 2 — Suspects

**Purpose:** Generate all suspect characters in full. At this stage, candidate IDs are introduced. The backend has already assigned the `caseSlug` and will assign final suspect IDs, but the model proposes `id` slugs for itself to use in dialogue references.

**Required inputs:**
- `CaseFoundation` from Step 1
- Suspect count from difficulty rules

**Depends on:** Step 1 (validated)

**Output JSON:** `SuspectsResult`

```json
{
  "suspects": [
    {
      "id": "eleanor-hargrove",
      "name": "Eleanor Hargrove",
      "age": 34,
      "occupation": "Estate heir",
      "relationship": "Victim's younger sister",
      "description": "...",
      "personality": "...",
      "alibi": "...",
      "secretUnrelatedToCase": "...",
      "isLying": true,
      "isMistaken": false,
      "isHidingSecret": true,
      "interviewDialogue": [
        { "speakerId": "eleanor-hargrove", "speakerName": "Eleanor Hargrove", "text": "...", "revealsTruth": false }
      ],
      "imagePrompt": "..."
    }
  ]
}
```

**Backend validation after step:**
- Exactly the right count of suspects per difficulty
- All suspect IDs are unique, kebab-case
- `culpritLabel` from Step 1 maps to exactly one suspect (backend resolves label → id)
- Each `lyingSuspectLabel` maps to a suspect with `isLying: true`
- Each suspect has at least 4 `interviewDialogue` entries
- No duplicate `speakerId` values within a single suspect's dialogue array

**Can be retried independently:** Yes

**Mandatory:** Yes

---

### Step 3 — Locations

**Purpose:** Generate all locations. Locations are independent of suspects and clues at this stage; `cluesFoundHere` is left empty and populated later by the backend during assembly.

**Required inputs:**
- `CaseFoundation` from Step 1

**Depends on:** Step 1 (validated)

**Output JSON:** `LocationsResult`

```json
{
  "locations": [
    {
      "id": "drawing-room",
      "name": "The Drawing Room",
      "description": "...",
      "atmosphere": "...",
      "imagePrompt": "..."
    }
  ]
}
```

**Backend validation after step:**
- At least 4, no more than 7 locations
- All IDs unique and kebab-case
- All required string fields present

**Can be retried independently:** Yes (parallel with Step 2)

**Mandatory:** Yes

**Note:** `cluesFoundHere` is intentionally omitted here. The backend derives it during assembly by inverting `clue.locationId` references.

---

### Step 4 — Clues

**Purpose:** Generate all evidence items. Clues reference location IDs (now available from Step 3) and are tagged with truth significance flags. Red herring clues are explicitly requested. The truth chain (which clues prove guilt) is specified by the backend based on culprit logic from Step 1.

**Required inputs:**
- `CaseFoundation` from Step 1 (for culprit logic)
- `SuspectsResult` from Step 2 (for culprit id)
- `LocationsResult` from Step 3 (for `locationId` references)

**Depends on:** Steps 1, 2, 3 (all validated)

**Output JSON:** `CluesResult`

```json
{
  "clues": [
    {
      "id": "torn-letter",
      "name": "Torn letter fragment",
      "description": "...",
      "locationId": "library",
      "isRedHerring": false,
      "revealsInfo": "...",
      "imagePrompt": "..."
    }
  ],
  "culpritClueIds": ["arsenic-vial", "torn-letter", "monogrammed-glove"],
  "redHerringClueIds": ["muddy-footprint", "missing-candlestick"],
  "importantClueId": "arsenic-vial"
}
```

**Backend validation after step:**
- 8–12 clues total; at least 2 `isRedHerring: true`
- All `locationId` values exist in `LocationsResult.locations`
- `culpritClueIds` and `redHerringClueIds` are non-overlapping subsets of clue IDs
- `importantClueId` exists in clues, is not a red herring
- `redHerringClueIds` all have `isRedHerring: true`
- All clue IDs unique and kebab-case

**Can be retried independently:** Yes (if locations haven't changed)

**Mandatory:** Yes

---

### Step 5 — Timeline

**Purpose:** Generate the 10-entry public timeline. Mix of true and false events. The actual moment of the crime must be present with `isTrue: true`. At this stage suspects are known, so `involvedSuspectIds` references are valid.

**Required inputs:**
- `CaseFoundation` from Step 1
- `SuspectsResult` from Step 2 (for `involvedSuspectIds`)

**Depends on:** Steps 1, 2 (validated)

**Output JSON:** `TimelineResult`

```json
{
  "timeline": [
    {
      "id": "evening-dinner",
      "time": "7:00 PM",
      "description": "The household gathers for dinner. Victor Hargrove appears in high spirits.",
      "involvedSuspectIds": ["eleanor-hargrove", "thomas-briggs"],
      "isTrue": true
    }
  ]
}
```

**Backend validation after step:**
- Exactly 10 entries
- All IDs unique and kebab-case
- All `involvedSuspectIds` entries exist in `SuspectsResult`
- At least 3 `isTrue: true`, at least 2 `isTrue: false`
- At least 1 entry must include the crime itself (`isTrue: true`)

**Can be retried independently:** Yes (parallel with Steps 3, 4)

**Mandatory:** Yes

---

### Step 6 — Event Graph

**Purpose:** Generate the investigation event graph (what the player can do). This is the most cross-reference-heavy step. It references suspect IDs, clue IDs, and puzzle IDs (which don't exist yet). The event graph is generated here with `puzzleId` fields set to a placeholder label. The backend resolves puzzle references in Step 7.

**Required inputs:**
- `CaseFoundation` from Step 1 (for act structure)
- `SuspectsResult` from Step 2 (for `dialogueSuspectId`, `unlocksSuspectIds`)
- `CluesResult` from Step 4 (for `rewardsClueIds`, unlock conditions)

**Depends on:** Steps 1, 2, 4 (validated)

**Output JSON:** `EventGraphResult`

```json
{
  "events": [
    {
      "id": "search-library",
      "category": "investigation",
      "type": "searchRoom",
      "title": "Search the library",
      "description": "The library smells of old books and something chemical.",
      "act": 1,
      "isMandatory": true,
      "unlockConditions": [],
      "rewardsClueIds": ["torn-letter"],
      "unlocksSuspectIds": [],
      "puzzleLabel": null,
      "dialogueSuspectId": null,
      "narration": "..."
    },
    {
      "id": "solve-cipher-desk",
      "category": "puzzle",
      "type": "solveCipher",
      "title": "Decode the desk cipher",
      "description": "A locked brass box sits on the desk, its surface engraved with symbols.",
      "act": 2,
      "isMandatory": false,
      "unlockConditions": [{ "type": "clue_found", "referenceId": "torn-letter" }],
      "rewardsClueIds": ["cipher-solution"],
      "unlocksSuspectIds": [],
      "puzzleLabel": "desk-cipher",
      "dialogueSuspectId": null,
      "narration": "..."
    }
  ]
}
```

**Note on `puzzleLabel`:** Instead of `puzzleId` (which doesn't exist yet), the model emits a human-readable label string or `null`. The backend maps this to a real puzzle ID in Step 7.

**Backend validation after step:**
- 6–10 events across 3 acts
- Act 1 has at least 2 events with empty `unlockConditions`
- All IDs unique and kebab-case
- All `rewardsClueIds` exist in `CluesResult`
- All `dialogueSuspectId` values exist in `SuspectsResult`
- All `unlocksSuspectIds` exist in `SuspectsResult`
- All `unlockCondition.referenceId` values of type `clue_found` exist in `CluesResult`
- All `unlockCondition.referenceId` values of type `event_completed` exist in this events array
- No circular unlock conditions (graph cycle detection)

**Can be retried independently:** Yes (if suspects/clues haven't changed)

**Mandatory:** Yes

---

### Step 7 — Puzzle Specs

**Purpose:** Generate puzzle specifications with no HTML. Each puzzle spec describes the puzzle type, mechanics, and solution. HTML generation is a separate sub-step (Step 7b). This separation is critical: generating HTML inside a large JSON blob is one of the most common failure modes.

**Required inputs:**
- `EventGraphResult` from Step 6 (for `puzzleLabel` references)
- `CluesResult` from Step 4 (for `rewardedClueId` mapping)
- `CaseFoundation` from Step 1 (for tone/theme)

**Depends on:** Steps 1, 4, 6 (validated)

**Output JSON:** `PuzzleSpecsResult`

```json
{
  "puzzleSpecs": [
    {
      "label": "desk-cipher",
      "id": "puzzle-desk-cipher",
      "type": "cipher",
      "title": "The Brass Box Cipher",
      "description": "A small brass lockbox with a 4-symbol combination. The symbols are engraved around the edge of the lid.",
      "solutionCondition": "The player selects the four symbols that match the ones on the torn letter fragment: moon, star, dagger, rose.",
      "rewardedClueLabel": "cipher-solution",
      "hints": [
        "The box was obviously carved by hand.",
        "The engraving style matches something you've already found.",
        "Look at the symbols on the torn letter.",
        "The order is: moon, star, dagger, rose."
      ]
    }
  ]
}
```

**Backend validation after step:**
- Each `label` matches a `puzzleLabel` from `EventGraphResult`
- `rewardedClueLabel` maps to a clue ID in `CluesResult`
- `hints` has 3–5 entries
- All IDs unique and kebab-case

**Can be retried independently:** Yes

**Mandatory:** Yes (if any events have `puzzleLabel` non-null)

---

### Step 7b — Puzzle HTML Generation (sub-step, one call per puzzle)

**Purpose:** Generate the self-contained HTML component for a single puzzle. This is a separate call per puzzle to keep the output small and to allow targeted regeneration if the HTML is broken.

**Required inputs:**
- Single `PuzzleSpec` from Step 7
- The puzzle's `id` (so the postMessage call can be exact)

**Depends on:** Step 7 (validated)

**Output:** Raw HTML string (not JSON — see Section 6 for details)

**Backend validation after step:**
- Valid HTML (parseable by DOMParser)
- Contains exactly one `window.parent.postMessage` call
- postMessage payload matches `{type:'PUZZLE_SOLVED', puzzleId:'<exact-id>'}`
- No `allow-same-origin` policy violations
- No `localStorage`, `sessionStorage`, `document.cookie` access
- No external `<script src="">` or `<link href="">` tags
- HTML length under 12,000 characters

**Can be retried independently:** Yes — retry only this puzzle's HTML

**Mandatory:** Yes (one call per puzzle spec)

---

### Step 8 — Hint Ladder + Solution Explanation

**Purpose:** Generate the 5-step hint ladder and the full solution narrative. At this stage all suspects, clues, and events are known, so hints can reference specific evidence. The solution explanation's steps are derived from the truth logic.

**Required inputs:**
- `CaseFoundation` from Step 1
- `SuspectsResult` from Step 2
- `CluesResult` from Step 4
- `EventGraphResult` from Step 6

**Depends on:** Steps 1, 2, 4, 6 (validated)

**Output JSON:** `HintAndSolutionResult`

```json
{
  "hintLadder": [
    { "index": 0, "text": "...", "targetsEventId": null },
    { "index": 1, "text": "...", "targetsEventId": "search-library" },
    { "index": 2, "text": "...", "targetsEventId": "interview-eleanor" },
    { "index": 3, "text": "...", "targetsEventId": null },
    { "index": 4, "text": "...", "targetsEventId": null }
  ],
  "solutionExplanation": {
    "narrative": "...",
    "stepsExplained": ["...", "...", "...", "...", "..."],
    "redHerringExplanations": ["...", "..."]
  }
}
```

**Backend validation after step:**
- Exactly 5 hint ladder entries, indices 0–4
- All non-null `targetsEventId` values exist in `EventGraphResult`
- `stepsExplained` has exactly 5 entries
- `redHerringExplanations` count matches `redHerringClueIds` count from `CluesResult`

**Can be retried independently:** Yes

**Mandatory:** Yes

---

### Step 9 — Visual Direction, UI Theme, and Image Prompt Templates

**Purpose:** Generate all visual/aesthetic metadata. This is entirely independent of game logic and can run in parallel with Step 8. No cross-referencing to game entities required.

**Required inputs:**
- `CaseFoundation` from Step 1 (for tone and style)
- `stylePreference` (original input)
- `SuspectsResult` from Step 2 (for template fields)

**Depends on:** Steps 1, 2 (validated)

**Output JSON:** `VisualResult`

```json
{
  "visualDirection": {
    "artStyle": "...",
    "mood": "gothic and claustrophobic",
    "colorPalette": ["#1a1a2e", "#16213e", "#c9a84c", "#0f0f23", "#e8e0d0", "#9e9e8e"],
    "lightingStyle": "chiaroscuro candlelight",
    "renderingStyle": "oil painting with visible brushstrokes",
    "globalStylePrompt": "noir oil painting, dramatic shadows, 1930s aesthetic, muted sepia tones",
    "negativePrompt": "anime, cartoon, modern technology, bright colours"
  },
  "uiTheme": {
    "primaryColor": "#1a1a2e",
    "secondaryColor": "#16213e",
    "accentColor": "#c9a84c",
    "surfaceColor": "#0f0f23",
    "textColor": "#e8e0d0",
    "textMutedColor": "#9e9e8e",
    "panelStyle": "raised",
    "borderStyle": "1px solid rgba(201,168,76,0.3)",
    "shadowStyle": "0 4px 24px rgba(0,0,0,0.6)",
    "textureFamily": "paper"
  },
  "imagePromptTemplates": {
    "suspectPortrait": "noir oil painting, 1930s, portrait of {name}, {occupation}, {description}, dramatic chiaroscuro lighting, detailed, moody",
    "locationScene": "noir oil painting, 1930s interior, {name}, {atmosphere}, atmospheric, cinematic",
    "clueObject": "noir still life, 1930s, {name}, {description}, moody lighting, detailed",
    "eventSplash": "noir oil painting, 1930s detective scene, atmospheric, dramatic shadows",
    "puzzleObject": "noir object study, 1930s antique, intricate detail, mysterious"
  }
}
```

**Backend validation after step:**
- All hex values are valid 6-digit hex codes
- `colorPalette` has 4–6 entries
- `textureFamily` is one of the known enum values
- All template strings present

**Can be retried independently:** Yes (parallel with Steps 5, 6, 8)

**Mandatory:** Yes

---

### Step 10 — Validation / Repair Pass

**Purpose:** This is not an AI step — it is a pure backend pass. The backend assembles all partial outputs, runs the full cross-reference validation logic, and either confirms success or triggers targeted repair prompts for specific failed fields. See Section 5 for full validation and repair logic.

If targeted repair is needed, the backend generates a small repair prompt for only the broken fragment and sends it back to the model. This counts as a separate mini-call, not a full regeneration.

**Mandatory:** Yes

---

<a name="section-2"></a>
## Section 2 — JSON Contracts Per Step

### Design Rules

- Each step's JSON only contains the fields that step is responsible for generating.
- The backend rejects any output where prohibited fields appear (this prevents model hallucination from adding fields it shouldn't know about yet).
- IDs follow the format `^[a-z][a-z0-9-]*[a-z0-9]$`.
- The backend assigns the top-level `caseId` once in Step 1 and stamps it into all subsequent outputs during assembly.

---

### Step 1 — `CaseFoundation`

| Field | Required | Type | Notes |
|---|---|---|---|
| `caseSlug` | ✅ | string | kebab-case, unique, model-proposed |
| `title` | ✅ | string | |
| `subtitle` | ✅ | string | |
| `caseType` | ✅ | `"murder"\|"theft"\|"disappearance"\|"sabotage"\|"other"` | |
| `setting` | ✅ | string | |
| `briefing` | ✅ | string | |
| `act1Summary` | ✅ | string | |
| `act2Summary` | ✅ | string | |
| `act3Summary` | ✅ | string | |
| `culpritLabel` | ✅ | string | human-readable label |
| `motive` | ✅ | string | |
| `method` | ✅ | string | |
| `trueTimeline` | ✅ | string | paragraph |
| `keyContradiction` | ✅ | string | |
| `redHerringExplanation` | ✅ | string | |
| `suspectLabels` | ✅ | string[] | 3–5 entries |
| `lyingSuspectLabels` | ✅ | string[] | subset of suspectLabels |
| `mistakenSuspectLabels` | ✅ | string[] | subset of suspectLabels |
| `hidingSecretSuspectLabels` | ✅ | string[] | subset of suspectLabels |

**Prohibited:** Any IDs, any arrays of game entities, HTML, theme colors.

---

### Step 2 — `SuspectsResult`

| Field | Required | Notes |
|---|---|---|
| `suspects[].id` | ✅ | Must be unique kebab-case |
| `suspects[].name` | ✅ | |
| `suspects[].age` | ✅ | number |
| `suspects[].occupation` | ✅ | |
| `suspects[].relationship` | ✅ | to victim |
| `suspects[].description` | ✅ | |
| `suspects[].personality` | ✅ | |
| `suspects[].alibi` | ✅ | |
| `suspects[].secretUnrelatedToCase` | ✅ | |
| `suspects[].isLying` | ✅ | boolean |
| `suspects[].isMistaken` | ✅ | boolean |
| `suspects[].isHidingSecret` | ✅ | boolean |
| `suspects[].interviewDialogue` | ✅ | min 4 entries |
| `suspects[].imagePrompt` | ✅ | |

**Prohibited:** Location IDs, clue IDs, puzzle IDs, theme fields.

**Valid ID examples:** `eleanor-hargrove`, `thomas-briggs-jr`, `mrs-penrose`

---

### Step 3 — `LocationsResult`

| Field | Required | Notes |
|---|---|---|
| `locations[].id` | ✅ | kebab-case |
| `locations[].name` | ✅ | |
| `locations[].description` | ✅ | |
| `locations[].atmosphere` | ✅ | |
| `locations[].imagePrompt` | ✅ | |

**Prohibited:** `cluesFoundHere` (derived by backend), suspect IDs, event IDs.

---

### Step 4 — `CluesResult`

| Field | Required | Notes |
|---|---|---|
| `clues[].id` | ✅ | kebab-case |
| `clues[].name` | ✅ | |
| `clues[].description` | ✅ | |
| `clues[].locationId` | ✅ | Must exist in Step 3 output |
| `clues[].isRedHerring` | ✅ | boolean |
| `clues[].revealsInfo` | ✅ | |
| `clues[].imagePrompt` | ✅ | |
| `culpritClueIds` | ✅ | string[] — non-overlapping with redHerring |
| `redHerringClueIds` | ✅ | string[] |
| `importantClueId` | ✅ | string — the smoking gun |

**Prohibited:** Suspect dialogue, event IDs, theme fields. References to suspect IDs are permitted only in `revealsInfo` text (not as structured fields).

---

### Step 5 — `TimelineResult`

| Field | Required | Notes |
|---|---|---|
| `timeline[].id` | ✅ | kebab-case |
| `timeline[].time` | ✅ | string |
| `timeline[].description` | ✅ | |
| `timeline[].involvedSuspectIds` | ✅ | string[] — may be empty |
| `timeline[].isTrue` | ✅ | boolean |

**Prohibited:** Clue IDs, event IDs, puzzle IDs.

---

### Step 6 — `EventGraphResult`

| Field | Required | Notes |
|---|---|---|
| `events[].id` | ✅ | kebab-case |
| `events[].category` | ✅ | enum |
| `events[].type` | ✅ | camelCase string |
| `events[].title` | ✅ | |
| `events[].description` | ✅ | |
| `events[].act` | ✅ | 1, 2, or 3 |
| `events[].isMandatory` | ✅ | boolean |
| `events[].unlockConditions` | ✅ | array (may be empty) |
| `events[].rewardsClueIds` | ✅ | string[] |
| `events[].unlocksSuspectIds` | ✅ | string[] |
| `events[].puzzleLabel` | ✅ | string or null |
| `events[].dialogueSuspectId` | optional | string or null |
| `events[].narration` | ✅ | |

**Note:** `puzzleLabel` is a human-readable string (e.g. `"desk-cipher"`), NOT a puzzle ID. The backend maps this to a real ID in Step 7, so the model cannot reference a puzzle ID that doesn't exist yet.

**Prohibited:** Theme fields, HTML, puzzle IDs (use `puzzleLabel` instead).

---

### Step 7 — `PuzzleSpecsResult`

| Field | Required | Notes |
|---|---|---|
| `puzzleSpecs[].label` | ✅ | matches `puzzleLabel` from Step 6 |
| `puzzleSpecs[].id` | ✅ | backend may override for uniqueness |
| `puzzleSpecs[].type` | ✅ | enum |
| `puzzleSpecs[].title` | ✅ | |
| `puzzleSpecs[].description` | ✅ | |
| `puzzleSpecs[].solutionCondition` | ✅ | |
| `puzzleSpecs[].rewardedClueLabel` | ✅ | human-readable — backend maps to ID |
| `puzzleSpecs[].hints` | ✅ | string[] 3–5 entries |

**Prohibited:** `htmlComponent` (this is Step 7b), event IDs, theme fields.

---

### Step 7b — Puzzle HTML (per puzzle)

This step returns a **raw HTML string**, not JSON. The backend wraps it into `{ "html": "..." }` for storage.

**Input to prompt:**
- Puzzle ID
- Puzzle title, description, type
- `solutionCondition`
- Hints

**Output format:** Raw HTML document string. No JSON wrapper.

---

### Step 8 — `HintAndSolutionResult`

| Field | Required | Notes |
|---|---|---|
| `hintLadder[].index` | ✅ | 0–4 |
| `hintLadder[].text` | ✅ | |
| `hintLadder[].targetsEventId` | ✅ | string or null |
| `solutionExplanation.narrative` | ✅ | prose string |
| `solutionExplanation.stepsExplained` | ✅ | string[] exactly 5 |
| `solutionExplanation.redHerringExplanations` | ✅ | string[] |

**Prohibited:** Game entity IDs except `targetsEventId`, HTML, theme fields.

---

### Step 9 — `VisualResult`

| Field | Required | Notes |
|---|---|---|
| `visualDirection.*` | ✅ | all fields |
| `uiTheme.*` | ✅ | all fields |
| `imagePromptTemplates.*` | ✅ | all 5 templates |

**Prohibited:** All game entity IDs, HTML, suspect data.

---

<a name="section-3"></a>
## Section 3 — How to Restructure for Gemma

### Why Smaller Prompts Are Better

Gemma is a smaller model than Gemini Ultra. Its context window and reliable structured-output capability both have practical limits. When given a prompt that asks for 14 different entity types in a single JSON response, the model makes tradeoffs: later fields in the output receive less attention, and cross-references between arrays degrade in consistency. A 2000-token constraint is realistic for reliable Gemma output. The pipeline above keeps each step well under that.

The critical problem with the one-shot approach is **attention dilution**. By the time the model is writing `eventGraph` entries, it has already generated 1000+ tokens of suspects, clues, and locations, and its attention window struggles to maintain the exact ID strings needed for valid cross-references. Smaller steps eliminate this problem by making each step's context fit comfortably in the model's working memory.

### Why Cross-Linked Structures Are Dangerous in One Response

In a 14-section JSON object, almost every section references IDs from other sections. This creates a problem: the model must first generate entities, then later reference them exactly by ID string. With one response, any typo in an early ID propagates silently through all later references. With a staged pipeline, the backend validates IDs after each step and refuses to proceed to any step that would reference broken IDs.

### How to Reduce Hallucinated References

The key technique is **deferred ID introduction**. In Steps 1–3, the model uses human-readable labels (`"jealous younger sister"`) instead of IDs. The backend normalises these to `kebab-case` IDs after each step, then injects the canonical ID list into the next step's prompt. This means the model is never asked to invent an ID and then correctly recall it 2000 tokens later — the backend provides the IDs as context.

Only once the ID list is provided in a step's prompt should that step be allowed to reference those IDs.

### How to Avoid Giant Embedded HTML

The single largest cause of broken JSON in the old approach was the `htmlComponent` field inside `puzzles`. An inline HTML string with templated backticks, event listeners, and postMessage calls contains many characters that require JSON-escaping (`"`, `\n`, `\t`, `\\`). A single unescaped quote anywhere inside 400 lines of HTML breaks the entire 2000-token JSON object.

The solution is to never generate HTML inside a JSON structure. Step 7b returns **raw HTML text only**, with no outer JSON wrapper. The backend stores it separately and injects it during final assembly.

### Separating Creative from Validation-Sensitive Generation

**Creative generation** (the things the model is good at): character descriptions, dialogue, narrative prose, puzzle flavour text, atmosphere. These are best generated in the early steps with relaxed constraints on cross-references.

**Validation-sensitive generation** (where errors compound): ID assignments, unlock conditions, clue chains, culprit logic. These are best handled in later steps where all relevant IDs are already known and injected into the prompt.

The pipeline follows this principle: steps 1–3 are predominantly creative with minimal referencing. Steps 4–7 introduce cross-references one domain at a time. Steps 8–9 are output-only with no new entity creation.

### What the Backend Should Do Deterministically

These things should **never** be left to the model:

| Responsibility | Backend Action |
|---|---|
| Final case ID assignment | Backend generates `uuid` or slug from title + random suffix |
| Deduplicating IDs | Backend detects and renames conflicts |
| Deriving `cluesFoundHere` | Inverted from `clue.locationId` — backend computes |
| Mapping `puzzleLabel → puzzleId` | Backend resolves during assembly |
| Mapping culprit/lying label → ID | Backend resolves using label-to-id map built in Step 2 |
| Validating circular unlock deps | Backend runs DAG cycle detection |
| Stamping `generatedAt` | Backend timestamps |
| Casing and sanitizing IDs | Backend normalises all model-provided IDs to valid kebab-case |

### Backend vs. Model ID Strategy

**Model-generated IDs should be:**
- Semantically meaningful (`eleanor-hargrove`, `torn-letter`)
- Treated as **suggestions** by the backend
- Sanitised (lowercased, spaces replaced with hyphens, special chars stripped)
- Checked for conflicts before acceptance

**Backend-generated IDs should be:**
- The top-level `caseId` (never trust the model's `caseSlug` as the final stored key)
- Any auto-derived fields like the `generatedAt` timestamp
- Used for any conflict-resolved ID that the model would not know about

**When to allow the model to reference existing IDs:**
- Only once the backend has provided the canonical ID list for that entity type in the step's prompt context
- Never ask the model to reference an ID from an array it hasn't been told about yet

**Human-readable labels vs. IDs:**
- In prompts where IDs are not yet assigned (Steps 1–3): use labels only
- In prompts where IDs are now known: inject them as a compact JSON array in the prompt and instruct the model to use them verbatim

### Keeping Prompts Short but Constrained

Each prompt should follow this structure:

1. **Role preamble** (1–2 sentences): What the model is doing in this step.
2. **Available context** (compact JSON snippets or arrays only): Only the fields from prior steps that this step actually needs.
3. **Output contract** (1–2 sentences + example shape): What exact JSON to return.
4. **Hard constraints** (bulleted, no more than 8): The 3–5 rules that matter most for this step.
5. **Final instruction** (1 sentence): "Return raw valid JSON only. No markdown. No explanation."

**Avoid:** Long schema definitions. Instead, provide a real example JSON with the target structure. Gemma responds better to examples than to abstract field descriptions.

---

<a name="section-4"></a>
## Section 4 — Prompt Strategy Per Step

### Design Principles

- No `systemInstruction` field. All guidance is in the `user` message.
- No markdown fences. The instruction to not use them must be explicit and the first thing in the output format instructions.
- Prompts use example-driven JSON, not schema notation.
- Each prompt ends with: `Return raw valid JSON only. Do not include markdown fences, explanations, or any text before or after the JSON object.`
- Temperature: 0.85 for creative steps (1, 2, 3, 5, 8, 9), 0.6 for referential steps (4, 6, 7).

---

### Step 1 — Case Foundation Prompt

**Objective:** Generate a coherent mystery premise with a hidden truth.

**Instruction style:** Open creative brief. Ask for creative flair. The truth fields should feel like a locked-room puzzle.

**Hard constraints:**
- `culpritLabel` must appear in `suspectLabels`
- `lyingSuspectLabels` must be a subset of `suspectLabels`
- No IDs — labels only

**What NOT to ask for:** Character descriptions, clue details, HTML, themes.

**Template:**

```
You are designing a detective mystery case for a single-player game called "The Last Alibi".

DIFFICULTY: {{DIFFICULTY}}
{{DIFFICULTY_GUIDANCE}}

ART STYLE / TONE: {{STYLE_PREFERENCE}}

Create the foundation for this mystery case. Return a single JSON object exactly matching this structure:

{
  "caseSlug": "the-garden-party-murder",
  "title": "The Garden Party Murder",
  "subtitle": "Everyone had a reason to want him dead",
  "caseType": "murder",
  "setting": "1930s English country manor",
  "briefing": "2-3 sentence briefing the detective reads on arrival.",
  "act1Summary": "What the player discovers in Act 1.",
  "act2Summary": "What deepens in Act 2.",
  "act3Summary": "How the truth crystallises in Act 3.",
  "culpritLabel": "the jealous younger sister",
  "motive": "To reclaim the inheritance she was denied",
  "method": "Arsenic dissolved in the evening brandy",
  "trueTimeline": "Paragraph describing what actually happened.",
  "keyContradiction": "The single logical contradiction that exposes the culprit.",
  "redHerringExplanation": "Why the misleading evidence seemed incriminating but wasn't.",
  "suspectLabels": ["the jealous younger sister", "the business partner", "the wronged servant", "the family lawyer", "the estranged son"],
  "lyingSuspectLabels": ["the business partner", "the estranged son"],
  "mistakenSuspectLabels": ["the wronged servant"],
  "hidingSecretSuspectLabels": ["the family lawyer"]
}

Rules:
- culpritLabel must appear verbatim in suspectLabels
- lyingSuspectLabels, mistakenSuspectLabels, and hidingSecretSuspectLabels must all be subsets of suspectLabels
- Do not invent character names or clue details in this step
- suspectLabels must have exactly {{SUSPECT_COUNT}} entries

Return raw valid JSON only. Do not include markdown fences, explanations, or any text before or after the JSON object.
```

---

### Step 2 — Suspects Prompt

**Objective:** Expand each suspect label into a fully fleshed character.

**Instruction style:** Character creation brief. Emphasise distinct voices, contrasting personalities, and plausible lies.

**Hard constraints:**
- Exactly `{{SUSPECT_COUNT}}` suspects
- Each suspect's `id` must be a kebab-case version of their name
- Each suspect with label in `lyingSuspectLabels` must have `isLying: true`
- At least 4 dialogue lines per suspect

**What NOT to ask for:** Clue IDs, location IDs, event IDs, HTML.

**Template:**

```
You are writing characters for a detective mystery game called "The Last Alibi".

THE CASE:
Title: {{FOUNDATION.title}}
Setting: {{FOUNDATION.setting}}
Culprit: The suspect described as "{{FOUNDATION.culpritLabel}}"
Motive: {{FOUNDATION.motive}}

SUSPECT ROLES:
{{FOUNDATION.suspectLabels as numbered list}}

Suspects who are lying about their alibi: {{FOUNDATION.lyingSuspectLabels}}
Suspects who are mistaken about events: {{FOUNDATION.mistakenSuspectLabels}}
Suspects who are hiding an unrelated secret: {{FOUNDATION.hidingSecretSuspectLabels}}

Generate exactly {{SUSPECT_COUNT}} suspects. Return a JSON object:

{
  "suspects": [
    {
      "id": "eleanor-hargrove",
      "name": "Eleanor Hargrove",
      "age": 34,
      "occupation": "Estate Heir",
      "relationship": "Victim's younger sister",
      "description": "Physical appearance and first impression in 1-2 sentences.",
      "personality": "2-3 dominant character traits.",
      "alibi": "What they claim they were doing at the time of the crime.",
      "secretUnrelatedToCase": "A personal secret that makes them seem suspicious but is unrelated to the crime.",
      "isLying": true,
      "isMistaken": false,
      "isHidingSecret": true,
      "interviewDialogue": [
        { "speakerId": "eleanor-hargrove", "speakerName": "Eleanor Hargrove", "text": "I was in the garden all evening. Anyone will tell you.", "revealsTruth": false },
        { "speakerId": "eleanor-hargrove", "speakerName": "Eleanor Hargrove", "text": "My brother and I had our differences, yes. But murder? That's absurd.", "revealsTruth": false },
        { "speakerId": "eleanor-hargrove", "speakerName": "Eleanor Hargrove", "text": "You should ask Thomas where he was. He was the last to see Victor alive.", "revealsTruth": true },
        { "speakerId": "eleanor-hargrove", "speakerName": "Eleanor Hargrove", "text": "I didn't inherit anything. That was the arrangement. I accepted it.", "revealsTruth": false }
      ],
      "imagePrompt": "{{STYLE_GLOBAL_PREFIX}}, portrait of Eleanor Hargrove, 34 year old woman, Victorian estate heir, suspicious expression, period costume"
    }
  ]
}

Rules:
- Each id must be the suspect's name in lowercase kebab-case (e.g. "eleanor-hargrove")
- speakerId in interviewDialogue must match the suspect's id exactly
- Suspects in lyingSuspectLabels must have isLying: true
- Each suspect must have at least 4 interviewDialogue entries
- Do not invent location IDs or clue IDs

Return raw valid JSON only. Do not include markdown fences, explanations, or any text before or after the JSON object.
```

---

### Step 3 — Locations Prompt

**Objective:** Create 5 distinct, atmospherically rich locations.

**Instruction style:** Scene-setting brief. Focus on sensory detail and distinct visual identity.

**Hard constraints:**
- Exactly 5 locations
- No `cluesFoundHere` field

**What NOT to ask for:** Clue IDs, suspect IDs, event IDs, HTML.

**Template:**

```
You are designing locations for a detective mystery game called "The Last Alibi".

THE CASE:
Title: {{FOUNDATION.title}}
Setting: {{FOUNDATION.setting}}
Mood: {{FOUNDATION.briefing}}

Create exactly 5 locations for this case. Return a JSON object:

{
  "locations": [
    {
      "id": "drawing-room",
      "name": "The Drawing Room",
      "description": "What the detective sees when they enter this location. 2 sentences.",
      "atmosphere": "Sensory details — smells, lighting, sounds. 1-2 sentences.",
      "imagePrompt": "{{STYLE_GLOBAL_PREFIX}}, interior scene, The Drawing Room, {{atmosphere details}}"
    }
  ]
}

Rules:
- Each id must be a short descriptive kebab-case string
- Do not include a cluesFoundHere field — this will be derived automatically
- Do not include suspect IDs or event references
- Locations must be distinct in atmosphere and function

Return raw valid JSON only. Do not include markdown fences, explanations, or any text before or after the JSON object.
```

---

### Step 4 — Clues Prompt

**Objective:** Generate all evidence items with correct location assignments and truth significance.

**Instruction style:** Evidence inventory brief. Be specific about what each clue physically is and what the detective logically infers.

**Hard constraints:**
- 8–12 clues total
- At least 2 `isRedHerring: true`
- At least 3 guilt-chain clues (non-red-herring, pointing at culprit)
- All `locationId` values must be exact IDs from the provided locations list
- `importantClueId` must not be a red herring

**What NOT to ask for:** Suspect dialogue, event unlock conditions, HTML.

**Template:**

```
You are generating evidence for a detective mystery game called "The Last Alibi".

THE CASE:
Title: {{FOUNDATION.title}}
Culprit's motive: {{FOUNDATION.motive}}
Culprit's method: {{FOUNDATION.method}}
Key contradiction: {{FOUNDATION.keyContradiction}}

AVAILABLE LOCATIONS (use these ids exactly in locationId fields):
{{LOCATIONS_JSON}}

Generate {{CLUE_COUNT}} clues. Return a JSON object:

{
  "clues": [
    {
      "id": "arsenic-vial",
      "name": "Glass vial with residue",
      "description": "A small glass vial half-hidden behind a flower vase. A faint chemical smell lingers around it.",
      "locationId": "drawing-room",
      "isRedHerring": false,
      "revealsInfo": "Chemical analysis would reveal arsenic. This vial was used to prepare the poison.",
      "imagePrompt": "{{STYLE_GLOBAL_PREFIX}}, close-up, small glass vial, arsenic residue, candlelight, suspicious, 1930s"
    }
  ],
  "culpritClueIds": ["arsenic-vial", "torn-letter", "monogrammed-glove"],
  "redHerringClueIds": ["muddy-footprint", "missing-candlestick"],
  "importantClueId": "arsenic-vial"
}

Rules:
- Every locationId must be exactly one of: {{LOCATION_IDS_LIST}}
- culpritClueIds and redHerringClueIds must not overlap
- importantClueId must be in culpritClueIds (not a red herring)
- At least 2 clues must have isRedHerring: true
- At least 3 clues must be in culpritClueIds

Return raw valid JSON only. Do not include markdown fences, explanations, or any text before or after the JSON object.
```

---

### Step 5 — Timeline Prompt

**Objective:** Generate a 10-entry narrative timeline mixing true and rumoured events.

**Template:**

```
You are writing the observable timeline of events for a detective mystery.

THE CASE:
Title: {{FOUNDATION.title}}
Setting: {{FOUNDATION.setting}}
True sequence of events: {{FOUNDATION.trueTimeline}}

SUSPECTS (use these ids exactly in involvedSuspectIds):
{{SUSPECTS_ID_NAME_LIST}}

Generate exactly 10 timeline entries covering the period around the crime. Some entries describe what actually happened (isTrue: true). Others describe rumours or false assumptions (isTrue: false).

Return a JSON object:

{
  "timeline": [
    {
      "id": "evening-gathering",
      "time": "7:00 PM",
      "description": "The household gathers for dinner. Victor appears in good spirits.",
      "involvedSuspectIds": ["eleanor-hargrove", "thomas-briggs"],
      "isTrue": true
    }
  ]
}

Rules:
- Exactly 10 entries
- At least one entry must describe the crime itself and have isTrue: true
- At least 2 entries must have isTrue: false (rumours or misdirection)
- Every suspect ID used must be from: {{SUSPECT_IDS_LIST}}
- involvedSuspectIds may be empty for general narrative entries

Return raw valid JSON only. Do not include markdown fences, explanations, or any text before or after the JSON object.
```

---

### Step 6 — Event Graph Prompt

**Objective:** Generate the player's investigation event graph with correct unlock conditions.

**Instruction style:** Game design brief. Emphasise act pacing, mandatory vs optional events, and logical unlock flow.

**Hard constraints:**
- 6–10 events
- Act 1 must have at least 2 events with empty `unlockConditions`
- No circular unlock conditions
- Use `puzzleLabel` (not `puzzleId`) for puzzle events

**What NOT to ask for:** Theme data, HTML, image prompts, puzzle HTML.

**Template:**

```
You are designing the investigation event flow for a detective mystery game.

THE CASE:
Title: {{FOUNDATION.title}}
Act 1: {{FOUNDATION.act1Summary}}
Act 2: {{FOUNDATION.act2Summary}}
Act 3: {{FOUNDATION.act3Summary}}

CLUE IDs (available for rewardsClueIds and unlock conditions):
{{CLUE_IDS_LIST}}

SUSPECT IDs (available for dialogueSuspectId and unlocksSuspectIds):
{{SUSPECT_IDS_WITH_NAMES}}

Generate {{EVENT_COUNT}} investigation events spread across 3 acts. Return a JSON object:

{
  "events": [
    {
      "id": "search-library",
      "category": "investigation",
      "type": "searchRoom",
      "title": "Search the library",
      "description": "The detective notices the library smells of chemicals beneath the mustiness.",
      "act": 1,
      "isMandatory": true,
      "unlockConditions": [],
      "rewardsClueIds": ["torn-letter"],
      "unlocksSuspectIds": [],
      "puzzleLabel": null,
      "dialogueSuspectId": null,
      "narration": "You push open the library door. Thousands of leather-bound volumes tower above you. A chemical smell cuts through the dust."
    },
    {
      "id": "solve-cipher",
      "category": "puzzle",
      "type": "solveCipher",
      "title": "Decode the desk cipher",
      "description": "A brass lockbox sits on the desk.",
      "act": 2,
      "isMandatory": false,
      "unlockConditions": [
        { "type": "clue_found", "referenceId": "torn-letter" }
      ],
      "rewardsClueIds": ["cipher-solution"],
      "unlocksSuspectIds": [],
      "puzzleLabel": "desk-cipher",
      "dialogueSuspectId": null,
      "narration": "The brass box you noticed earlier. Something about it matches the symbol on the letter."
    }
  ]
}

Rules:
- Act 1 must have at least 2 events with unlockConditions as an empty array []
- unlockConditions must NOT create circular dependencies (A unlocks B, B unlocks A is forbidden)
- Every referenceId in unlockConditions must be a valid clue ID or event ID from the lists above
- puzzleLabel is a short string label for puzzle events, or null for non-puzzle events
- Do not use a puzzleId field — use puzzleLabel instead

Return raw valid JSON only. Do not include markdown fences, explanations, or any text before or after the JSON object.
```

---

### Step 7 — Puzzle Specs Prompt

**Objective:** Describe what each puzzle is, how it works, and what its solution is. No HTML.

**Template:**

```
You are designing puzzle mechanics for a detective mystery game.

THE CASE:
Title: {{FOUNDATION.title}}
Setting: {{FOUNDATION.setting}}

PUZZLES NEEDED (these labels come from the event graph):
{{PUZZLE_LABELS_LIST}}

AVAILABLE REWARD CLUE IDs:
{{CLUE_IDS_WITH_NAMES}}

For each puzzle label, generate a puzzle specification. Return a JSON object:

{
  "puzzleSpecs": [
    {
      "label": "desk-cipher",
      "id": "puzzle-desk-cipher",
      "type": "cipher",
      "title": "The Brass Box Cipher",
      "description": "A small brass lockbox with a 4-symbol combination lock. Four symbols are engraved on the lid.",
      "solutionCondition": "The player selects the four symbols in the correct order: moon, star, dagger, rose. These match symbols on the torn letter.",
      "rewardedClueLabel": "cipher-solution",
      "hints": [
        "The box was crafted by the same person who made the letter holder.",
        "The symbols were chosen deliberately — they appear elsewhere in the house.",
        "Look at the symbols on the torn letter fragment.",
        "The correct sequence is: moon, star, dagger, rose."
      ]
    }
  ]
}

Rules:
- Each label must exactly match one of the puzzle labels listed above
- rewardedClueLabel must be a clue name (not an ID) — exactly as listed in the clue list above
- hints must have 3-5 entries ordered from vague to explicit
- Do not include a htmlComponent field — HTML is generated separately
- puzzle type must be one of: cipher, lock, pattern, fragment, logic_grid, sequence, map, mechanical

Return raw valid JSON only. Do not include markdown fences, explanations, or any text before or after the JSON object.
```

---

### Step 7b — Puzzle HTML Prompt

**Objective:** Generate a fully working, self-contained HTML puzzle component.

**Instruction style:** Implementation brief. Extremely specific requirements. No room for interpretation.

**Hard constraints:**
- Must call `window.parent.postMessage({type:'PUZZLE_SOLVED', puzzleId:'{{PUZZLE_ID}}'}, '*')` exactly once when the puzzle is solved
- No external resources
- No localStorage, sessionStorage, cookies
- No alert()
- Complete, self-contained HTML document
- Under 12,000 characters

**What NOT to ask for:** Narrative explanation, JSON structure, metadata.

**Note:** This prompt requests raw HTML, not JSON. The `responseMimeType` should be `text/plain` or `text/html`.

**Template:**

```
You are writing a self-contained HTML puzzle for a browser-based detective game.

PUZZLE: {{PUZZLE_SPEC.title}}
TYPE: {{PUZZLE_SPEC.type}}
DESCRIPTION: {{PUZZLE_SPEC.description}}
SOLUTION: {{PUZZLE_SPEC.solutionCondition}}
PUZZLE ID: {{PUZZLE_ID}}
THEME: Dark/moody, {{STYLE}} aesthetic. Use dark backgrounds, gold or amber accents.

Requirements:
1. Return a complete HTML document as plain text (starting with <!DOCTYPE html>).
2. All CSS must be inline in a <style> tag in the <head>.
3. All JavaScript must be inline in a <script> tag before </body>.
4. When the puzzle is solved correctly, execute this exact code once:
   window.parent.postMessage({type: 'PUZZLE_SOLVED', puzzleId: '{{PUZZLE_ID}}'}, '*');
5. Do NOT use alert(), confirm(), or prompt().
6. Do NOT reference any external URLs, scripts, or stylesheets.
7. Do NOT use localStorage or sessionStorage.
8. The puzzle must be solvable without any knowledge outside the page itself.
9. Provide clear visual feedback when the puzzle is solved.

Return only the raw HTML document. Do not include any explanation, markdown, or JSON wrapper.
```

---

### Step 8 — Hints and Solution Prompt

**Objective:** Generate the detective hint ladder and the full solution narrative.

**Template:**

```
You are writing the solution narrative and hint system for a detective mystery game.

THE CASE:
Title: {{FOUNDATION.title}}
True sequence: {{FOUNDATION.trueTimeline}}
Culprit: {{CULPRIT_NAME}} (id: {{CULPRIT_ID}})
Motive: {{FOUNDATION.motive}}
Method: {{FOUNDATION.method}}
Key contradiction: {{FOUNDATION.keyContradiction}}

KEY CLUES:
Guilt chain clues: {{CULPRIT_CLUE_NAMES}}
Red herring clues: {{RED_HERRING_CLUE_NAMES}}
Smoking gun: {{IMPORTANT_CLUE_NAME}}

INVESTIGATION EVENTS (for targetsEventId references):
{{EVENT_IDS_WITH_TITLES}}

Generate the hint ladder (5 progressive hints) and the solution explanation. Return a JSON object:

{
  "hintLadder": [
    { "index": 0, "text": "The victim was not alone as long as everyone claims.", "targetsEventId": null },
    { "index": 1, "text": "Someone in the household knew chemistry well.", "targetsEventId": "search-library" },
    { "index": 2, "text": "The sister had more reason than grief to want access to the library.", "targetsEventId": "interview-eleanor" },
    { "index": 3, "text": "The arsenic didn't come from outside. Look for where it was stored.", "targetsEventId": null },
    { "index": 4, "text": "Eleanor's alibi falls apart the moment you compare her story to Thomas's account.", "targetsEventId": null }
  ],
  "solutionExplanation": {
    "narrative": "3-5 paragraph prose narrative of the full truth written like the end of a classic detective novel.",
    "stepsExplained": [
      "The inciting event that set everything in motion.",
      "How the culprit planned and executed the act.",
      "How they attempted to cover it up.",
      "The key contradiction in their account.",
      "The final logical conclusion and verdict."
    ],
    "redHerringExplanations": [
      "One sentence per red herring clue explaining why it seemed incriminating but wasn't."
    ]
  }
}

Rules:
- Hints must be ordered from vague (index 0) to explicit (index 4)
- targetsEventId must be null or exactly one of the event IDs listed above
- stepsExplained must have exactly 5 entries
- redHerringExplanations must have one entry per red herring clue

Return raw valid JSON only. Do not include markdown fences, explanations, or any text before or after the JSON object.
```

---

### Step 9 — Visual Direction and Theme Prompt

**Objective:** Generate all visual and UI metadata.

**Template:**

```
You are designing the visual theme for a detective mystery game case.

THE CASE:
Title: {{FOUNDATION.title}}
Setting: {{FOUNDATION.setting}}
Mood/tone from act descriptions: {{FOUNDATION.act1Summary}}
Art style requested: {{STYLE_PREFERENCE}}

Generate visual direction, UI colours, and image prompt templates. Return a JSON object:

{
  "visualDirection": {
    "artStyle": "Description matching the requested art style.",
    "mood": "gothic and claustrophobic",
    "colorPalette": ["#1a1a2e", "#16213e", "#c9a84c", "#0f0f23", "#e8e0d0", "#9e9e8e"],
    "lightingStyle": "chiaroscuro candlelight",
    "renderingStyle": "oil painting with visible brushstrokes",
    "globalStylePrompt": "compact Imagen prefix to prepend to all image prompts, e.g.: noir oil painting, dramatic shadows, 1930s aesthetic",
    "negativePrompt": "what to exclude from all images, e.g.: anime, cartoon, modern technology, bright colours"
  },
  "uiTheme": {
    "primaryColor": "#1a1a2e",
    "secondaryColor": "#16213e",
    "accentColor": "#c9a84c",
    "surfaceColor": "#0f0f23",
    "textColor": "#e8e0d0",
    "textMutedColor": "#9e9e8e",
    "panelStyle": "raised",
    "borderStyle": "1px solid rgba(201,168,76,0.3)",
    "shadowStyle": "0 4px 24px rgba(0,0,0,0.6)",
    "textureFamily": "paper"
  },
  "imagePromptTemplates": {
    "suspectPortrait": "{{globalStylePrompt}}, portrait of {name}, {occupation}, {description}, dramatic lighting",
    "locationScene": "{{globalStylePrompt}}, interior scene, {name}, {atmosphere}",
    "clueObject": "{{globalStylePrompt}}, close-up still life, {name}, {description}",
    "eventSplash": "{{globalStylePrompt}}, detective scene, atmospheric",
    "puzzleObject": "{{globalStylePrompt}}, antique object study, intricate detail"
  }
}

Rules:
- All hex color values must be exactly 6 hex digits preceded by #
- colorPalette must have 4-6 entries
- textureFamily must be one of: paper, grain, cork, metal, leather, fabric, pixel_noise
- Templates must use {placeholder} syntax for variable fields

Return raw valid JSON only. Do not include markdown fences, explanations, or any text before or after the JSON object.
```

---

<a name="section-5"></a>
## Section 5 — Backend Validation and Repair Strategy

### Validation After Each Step

#### Step 1 — CaseFoundation

```
VALIDATE:
- caseSlug matches /^[a-z][a-z0-9-]+[a-z0-9]$/
- title, subtitle, briefing, act*Summary all non-empty strings
- caseType is valid enum value
- suspectLabels array has correct count for difficulty
- culpritLabel is in suspectLabels (exact match)
- lyingSuspectLabels, mistakenSuspectLabels, hidingSecretSuspectLabels are all subsets of suspectLabels
- motive, method, trueTimeline, keyContradiction, redHerringExplanation all non-empty

REPAIR TRIGGER: Re-run Step 1 entirely. Foundation is too cheap to repair partially.
```

#### Step 2 — Suspects

```
VALIDATE:
- Exactly correct count of suspects for difficulty
- All suspect IDs unique, match /^[a-z][a-z0-9-]+[a-z0-9]$/
- Backend can map culpritLabel → exactly one suspect
- All suspects in lyingSuspectLabels have isLying: true
- Each suspect has >= 4 interviewDialogue entries
- Each interviewDialogue[i].speakerId matches the parent suspect's id
- No duplicate IDs across all suspects

REPAIR TRIGGER:
- ID conflict or invalid format: backend strips and re-forms IDs from name, rejects full re-generation
- Missing dialogue lines: targeted repair prompt (see below)
- isLying mismatch: targeted repair prompt for just that suspect
```

**Targeted suspect repair prompt:**

```
The following suspect JSON has errors. Return ONLY this suspect's corrected JSON object.
Do not return the full suspects array.

ERRORS:
{{ERROR_LIST}}

ORIGINAL SUSPECT JSON:
{{SINGLE_SUSPECT_JSON}}

Return the corrected single suspect object. Raw JSON only, no wrapper array.
```

#### Step 3 — Locations

```
VALIDATE:
- At least 4, at most 7 locations
- All IDs unique and kebab-case
- name, description, atmosphere, imagePrompt all non-empty

REPAIR TRIGGER: High retry rate here is acceptable — rerun full step if count is wrong.
```

#### Step 4 — Clues

```
VALIDATE:
- 8-12 total clues
- All IDs unique and kebab-case
- Every locationId exists in Step 3 output (case-sensitive exact match)
- At least 2 clues have isRedHerring: true
- culpritClueIds and redHerringClueIds do not overlap
- importantClueId exists in clues array and is not flagged isRedHerring
- redHerringClueIds entries all have isRedHerring: true in the clues array

REPAIR TRIGGER:
- Invalid locationId references: targeted repair prompt with corrected location list
- Not enough red herrings: targeted repair prompt requesting exactly N more red herring clues
```

**Clue reference repair prompt:**

```
Some clues in this list have invalid locationId values. Correct ONLY the locationId fields.
Return ONLY the corrected clues array, not the full CluesResult.

VALID LOCATION IDs: {{LOCATION_IDS}}

INVALID CLUES:
{{BROKEN_CLUES_JSON}}

Return the corrected clues as a JSON array. Raw JSON only.
```

#### Step 5 — Timeline

```
VALIDATE:
- Exactly 10 entries
- All IDs unique and kebab-case
- All involvedSuspectIds values exist in Step 2 output
- At least 1 isTrue: true describing the crime
- At least 2 isTrue: false

REPAIR TRIGGER:
- Wrong count: re-run entire step
- Invalid suspect references: repair prompt with suspect list
```

#### Step 6 — Event Graph

```
VALIDATE:
- 6-10 events
- All IDs unique
- Act 1 has >= 2 events with empty unlockConditions
- All rewardsClueIds exist in Step 4 output
- All dialogueSuspectId values exist in Step 2 output
- All unlockConditions referenceIds exist in appropriate array
- No circular unlock dependencies (run Kahn's algorithm / DFS cycle detection)
- At least 1 mandatory event per act

REPAIR TRIGGER:
- Circular dependency: targeted repair prompt identifying the cycle
- Invalid references: targeted repair prompt with corrected ID lists
- Not enough Act 1 events: generate 1-2 additional Act 1 events via addendum prompt
```

**Circular dependency repair prompt:**

```
The following events form a circular unlock dependency. Fix the unlockConditions of the events in the cycle so the dependency is broken.
Return ONLY the repaired events as a JSON array.

CIRCULAR CYCLE DETECTED: {{CYCLE_DESCRIPTION}}

EVENTS IN CYCLE:
{{CYCLE_EVENTS_JSON}}

Return corrected events as a JSON array. Raw JSON only.
```

#### Step 7 — Puzzle Specs

```
VALIDATE:
- Each label matches a puzzleLabel from Step 6
- rewardedClueLabel maps to exactly one clue ID via name matching
- hints has 3-5 entries
- type is valid enum value

REPAIR TRIGGER: Re-run individual puzzle spec if label mismatch. 
```

#### Step 7b — Puzzle HTML

```
VALIDATE:
- Valid HTML (DOMParser.parseFromString — check for parse errors)
- Contains exactly one window.parent.postMessage call
- Payload matches {type:'PUZZLE_SOLVED', puzzleId:'<exact-id>'} (RegExp check)
- No <script src=""> or <link href=""> pointing to external URLs
- No localStorage, sessionStorage, document.cookie references
- Character length < 12,000
- Runs in an iframe sandbox (validate in sandboxed iframe, check for unhandled JS errors)

REPAIR TRIGGER:
- Missing or broken postMessage: targeted repair prompt (see Section 6)
- External resource reference: targeted repair prompt
- Exceeds length limit: re-run with tighter constraints added to prompt
```

#### Step 8 — Hints and Solution

```
VALIDATE:
- Exactly 5 hint ladder entries with indices 0-4
- All non-null targetsEventId values exist in Step 6 output
- stepsExplained has exactly 5 entries
- redHerringExplanations count matches redHerringClueIds count from Step 4

REPAIR: Re-run entire step — it is creative and cheap to rerun.
```

#### Step 9 — Visual

```
VALIDATE:
- All hex values match /#[0-9a-fA-F]{6}/
- colorPalette has 4-6 entries
- textureFamily is valid enum value
- All 5 template keys present

REPAIR: Re-run entire step. No cross-references to break.
```

---

### Repair Principle Summary

| Repair type | Strategy |
|---|---|
| Structural/format error (invalid JSON, wrong field names) | Re-run full step |
| Wrong count (too few/many suspects, timeline entries) | Re-run full step |
| Single broken entity (one invalid clue, one broken suspect) | Targeted repair prompt for that entity only |
| Reference error (wrong ID in a referenceId field) | Provide corrected ID list, ask to fix only that field |
| Logic error (circular deps, overlapping ID sets) | Problem-specific repair prompt with error description |
| HTML validation failure | Section 6 repair strategies |

**Key principle:** Never send the entire accumulated case context back to the model for a repair. Send only the minimal fragment needed to fix the specific problem.

---

### When to Trigger Full Regeneration vs. Repair

| Condition | Action |
|---|---|
| Step 1 fails validation twice | Full Step 1 regeneration |
| Step 2 fails for the same suspect 3 times | Replace that suspect with a new one (increment attempt counter per suspect) |
| Step 6 has circular dependency that repair cannot break | Re-run Step 6 entirely |
| Puzzle HTML fails 3 times for same puzzle | Replace the puzzle spec (re-run Step 7 for that label with altered type) |
| Any step returns empty or non-JSON response | Immediate re-run with additional instruction: "Your previous response was not valid JSON. Return only raw valid JSON." |

---

<a name="section-6"></a>
## Section 6 — Special Handling for Puzzles

### Why Puzzles Are High-Risk

Puzzle HTML generation was the leading cause of broken JSON in the one-shot pipeline. The problems are:

1. **JSON escaping:** A 200-line HTML string inside a JSON string value requires every `"`, `\n`, `<script>`, and backtick to be correctly escaped. A single unescaped double-quote inside the HTML breaks the entire JSON parse.
2. **length:** A working puzzle can be 3,000–8,000 characters. Combined with the rest of the case JSON, this routinely causes the model to truncate or produce corrupt output.
3. **Logical completeness:** The puzzle must be independently solvable, visually styled, and post the exact correct `postMessage`. Getting all three right in the same pass as narrative generation is too much to ask.

### Recommended Approach: Three-Stage Puzzle Pipeline

#### Stage A — Puzzle Spec (Step 7)

Generate abstract puzzle specification as JSON. No HTML. Only the following:
- What kind of puzzle it is
- What the player must do to solve it
- What the solution is
- What hints apply

This is a JSON generation task and is fast, reliable, and retryable.

#### Stage B — HTML Generation (Step 7b)

One call per puzzle. Returns **raw HTML only** (not wrapped in JSON). The backend uses `responseMimeType: 'text/plain'` or simply treats the raw response as HTML.

The prompt is minimal and hyper-focused. It provides the puzzle spec, the design constraints, the exact puzzle ID for the `postMessage`, and nothing else. No narrative context, no suspects, no case history.

This isolation is critical: the model is now only writing ~200 lines of HTML + JS. It doesn't need to maintain any other context.

#### Stage C — Sandbox Validation

After receiving HTML, the backend:

1. Parses the HTML string with a DOM parser
2. Checks for required strings using RegExp:
   ```regexp
   /window\.parent\.postMessage\(\s*\{\s*type\s*:\s*['"]PUZZLE_SOLVED['"]\s*,\s*puzzleId\s*:\s*['"]{{EXPECTED_ID}}['"]\s*\}\s*,\s*['"]\*['"]\s*\)/
   ```
3. Checks for forbidden patterns:
   ```regexp
   /(localStorage|sessionStorage|document\.cookie)/
   /(<script\s[^>]*src=["']https?:\/\/)|(<link\s[^>]*href=["']https?:\/\/)/
   /(alert|confirm|prompt)\s*\(/
   ```
4. Optionally spins up a sandboxed iframe (Node + puppeteer or a server-side headless browser) and validates that the postMessage fires on a known test interaction.

### Puzzle HTML Repair Prompts

**Repair case 1 — Wrong or missing postMessage:**

```
This puzzle HTML does not correctly call the required postMessage.

REQUIRED EXACT CODE:
window.parent.postMessage({type: 'PUZZLE_SOLVED', puzzleId: '{{PUZZLE_ID}}'}, '*');

CURRENT HTML:
{{PUZZLE_HTML}}

Fix ONLY the postMessage call. Return the corrected complete HTML document. Raw HTML only.
```

**Repair case 2 — External resource reference found:**

```
This puzzle HTML references an external URL which is not allowed.

RULE: All CSS and JavaScript must be inline. No <script src=""> or <link href=""> tags.

PROBLEM: {{FORBIDDEN_TAG}}

CURRENT HTML:
{{PUZZLE_HTML}}

Remove all external resource references and inline any required styles or scripts.
Return the complete corrected HTML document. Raw HTML only.
```

**Repair case 3 — Too long (> 12,000 characters):**

Re-run Step 7b with this addition at the end of the prompt:

```
IMPORTANT: Keep the total HTML document under 8,000 characters. Use minimal CSS. Avoid inline SVG. Keep the puzzle logic simple.
```

### When to Replace a Puzzle Spec Instead

If puzzle HTML fails 3 times for the same puzzle, do not continue retrying HTML generation. Instead, re-run Step 7 for that specific label with the following addition to the prompt:

```
NOTE: The previous attempt to generate HTML for this puzzle type failed validation repeatedly.
Generate a different, simpler puzzle type instead. Prefer: cipher or lock (these are easier to implement as HTML).
```

### PuzzleSpec JSON Schema

```json
{
  "label": "desk-cipher",
  "id": "puzzle-desk-cipher",
  "type": "cipher",
  "title": "The Brass Box Cipher",
  "description": "A brass lockbox with a 4-symbol combination on its lid.",
  "solutionCondition": "Select symbols in order: moon, star, dagger, rose.",
  "rewardedClueLabel": "cipher-solution",
  "hints": [
    "The symbols were chosen deliberately.",
    "They appear somewhere else in the case.",
    "Look at the torn letter fragment.",
    "The order is: moon, star, dagger, rose."
  ]
}
```

---

<a name="section-7"></a>
## Section 7 — Final Assembly Model

### Merge Order

The backend assembles the final `CasePackage` in this order. Each step is the source of truth for its own fields.

| Step | Source-of-truth for |
|---|---|
| Step 1 | `metadata.*`, `truth.motive`, `truth.method`, `truth.trueTimeline`, `truth.keyContradiction`, `truth.redHerringExplanation` |
| Step 2 | `suspects[]`, `truth.lyingSuspectIds`, `truth.mistakenSuspectIds`, `truth.hidingSecretSuspectIds`, `truth.culpritId` (resolved from label) |
| Step 3 | `locations[]` (without `cluesFoundHere`) |
| Step 4 | `clues[]`, `truth.importantClueId`, `truth.revealingClueIds`, `truth.redHerringClueIds` |
| Step 5 | `timeline[]` |
| Step 6 | `eventGraph[]` (with `puzzleId: null` initially) |
| Step 7 | populates `puzzleId` fields in `eventGraph` via label→id mapping |
| Step 7b | `puzzles[].htmlComponent` |
| Step 8 | `hintLadder[]`, `solutionExplanation.*` |
| Step 9 | `visualDirection.*`, `uiTheme.*`, `imagePromptTemplates.*` |
| Backend | `id` (top-level case UUID), `generatedAt`, `locations[].cluesFoundHere` |

### Conflict Resolution Rules

- The backend's ID assignments always win over model-proposed IDs when a conflict is detected.
- Label-to-ID resolution: if a label maps ambiguously to more than one suspect/clue, take the first match and log a warning. This should not happen if prompts are correctly constrained.
- If `rewardedClueLabel` in a puzzle spec matches no clue by name exactly, the backend falls back to fuzzy matching (Levenshtein distance ≤ 2). If still no match, emit a repair prompt targeting only the `rewardedClueLabel` field.

### Backend-Derived Fields

These fields are **never** model-generated — the backend computes them:

| Field | Derivation |
|---|---|
| `id` (top-level case) | `crypto.randomUUID()` or `caseSlug + '-' + shortHash` |
| `generatedAt` | `new Date().toISOString()` at the time of assembly |
| `locations[].cluesFoundHere` | For each location ID `L`, collect all `clue.id` where `clue.locationId === L` |
| `eventGraph[].puzzleId` | Resolved from `puzzleLabel` → `puzzleSpec.id` mapping |
| `truth.culpritId` | Resolved from `culpritLabel` → `suspect.id` mapping |
| `truth.lyingSuspectIds` | Resolved from `lyingSuspectLabels` → `suspect.id` mappings |
| `truth.mistakenSuspectIds` | Same |
| `truth.hidingSecretSuspectIds` | Same |
| `truth.revealingClueIds` | Taken directly from `CluesResult.culpritClueIds` (model-provided IDs, backend-validated) |
| `truth.redHerringClueIds` | Taken from `CluesResult.redHerringClueIds` |

### Final Canonical Schema

The assembled `CasePackage` matches the existing TypeScript `CasePackage` interface exactly. No changes to the TypeScript model are required. The pipeline is a change to *how* that structure is produced, not to its shape.

The only change needed to the existing model is adding `generatedAt` as a top-level field if it doesn't already exist (it currently does per the master prompt schema).

### Assembly Pseudocode

```typescript
async function assembleCasePackage(partials: GenerationPartials): Promise<CasePackage> {
  const caseId = `case-${partials.foundation.caseSlug}-${shortHash()}`;

  // Resolve label → ID maps
  const suspectLabelMap = buildLabelMap(partials.suspects);
  const clueNameMap = buildNameMap(partials.clues);
  const puzzleLabelMap = buildLabelMap(partials.puzzleSpecs);

  // Resolve truth ID references
  const truth: TruthLayer = {
    culpritId: suspectLabelMap[partials.foundation.culpritLabel],
    motive: partials.foundation.motive,
    method: partials.foundation.method,
    trueTimeline: partials.foundation.trueTimeline,
    keyContradiction: partials.foundation.keyContradiction,
    importantClueId: partials.clues.importantClueId,
    redHerringExplanation: partials.foundation.redHerringExplanation,
    lyingSuspectIds: partials.foundation.lyingSuspectLabels.map(l => suspectLabelMap[l]),
    mistakenSuspectIds: partials.foundation.mistakenSuspectLabels.map(l => suspectLabelMap[l]),
    hidingSecretSuspectIds: partials.foundation.hidingSecretSuspectLabels.map(l => suspectLabelMap[l]),
    revealingClueIds: partials.clues.culpritClueIds,
    redHerringClueIds: partials.clues.redHerringClueIds,
  };

  // Derive cluesFoundHere
  const locations = partials.locations.map(loc => ({
    ...loc,
    cluesFoundHere: partials.clues.clues
      .filter(c => c.locationId === loc.id)
      .map(c => c.id),
  }));

  // Resolve puzzle labels in event graph
  const eventGraph = partials.events.map(e => ({
    ...e,
    puzzleId: e.puzzleLabel ? puzzleLabelMap[e.puzzleLabel] ?? null : null,
  }));

  // Inject HTML into puzzle specs
  const puzzles = partials.puzzleSpecs.map(spec => ({
    id: spec.id,
    type: spec.type,
    title: spec.title,
    description: spec.description,
    htmlComponent: partials.puzzleHtml[spec.id],
    solutionCondition: spec.solutionCondition,
    rewardedClueId: clueNameMap[spec.rewardedClueLabel],
    hints: spec.hints,
  }));

  return {
    id: caseId,
    generatedAt: new Date().toISOString(),
    metadata: { ...partials.foundation, difficulty: partials.difficulty },
    truth,
    suspects: partials.suspects.suspects,
    locations,
    clues: partials.clues.clues,
    timeline: partials.timeline.timeline,
    eventGraph,
    puzzles,
    hintLadder: partials.hintAndSolution.hintLadder,
    solutionExplanation: partials.hintAndSolution.solutionExplanation,
    visualDirection: partials.visual.visualDirection,
    uiTheme: partials.visual.uiTheme,
    imagePromptTemplates: partials.visual.imagePromptTemplates,
  };
}
```

---

<a name="section-8"></a>
## Section 8 — Generation Order and Dependency Graph

### Dependency Graph

```
Input (difficulty + style)
         │
         ▼
    ┌─────────┐
    │  Step 1  │  CaseFoundation
    │Foundation│
    └─────────┘
         │
    ┌────┴───────────┐
    ▼                ▼
┌─────────┐    ┌─────────┐
│  Step 2  │    │  Step 3  │  (parallel)
│ Suspects │    │Locations │
└─────────┘    └─────────┘
    │    │          │
    │    └────┬─────┘
    │         ▼
    │    ┌─────────┐
    │    │  Step 4  │
    │    │  Clues   │
    │    └─────────┘
    │         │
    ├─────────┤
    ▼         ▼
┌─────────┐  ┌─────────┐
│  Step 5  │  │  Step 6  │  (Step 5 can run parallel with Step 6)
│Timeline  │  │EventGraph│
└─────────┘  └─────────┘
                  │
             ┌────┴───────────────────────────┐
             ▼                                ▼
        ┌─────────┐                    ┌─────────┐
        │  Step 7  │                   │  Step 9  │  (parallel)
        │PuzzleSpec│                   │  Visual  │
        └─────────┘                    └─────────┘
             │
        ┌────┴────┐  (parallel, one per puzzle)
        ▼         ▼
  ┌──────────┐  ┌──────────┐
  │Step 7b(1)│  │Step 7b(2)│
  │  HTML    │  │  HTML    │
  └──────────┘  └──────────┘
       │              │
       └──────┬───────┘
              ▼
         ┌─────────┐
         │  Step 8  │
         │Hints+Sol │
         └─────────┘
              │
              ▼
         ┌─────────┐
         │  Step 10 │
         │ Assembly │
         │+Validate │
         └─────────┘
              │
              ▼
         CasePackage
```

### Parallel Opportunities

| Steps that can run in parallel | Condition |
|---|---|
| Step 2 and Step 3 | Both depend only on Step 1 |
| Step 5 and Step 6 | Step 5 needs Steps 1+2; Step 6 needs Steps 1+2+4. Start Step 5 as soon as Step 2 completes, Step 6 as soon as Step 4 completes |
| Step 7b instances | Each puzzle HTML call is independent. Run all in parallel after Step 7 |
| Step 9 and Step 7 | Both can start after Step 1+2 complete. Step 9 doesn't need clues or events |

### Recommended Sequential Batches

**Batch 1** (sequential): Step 1

**Batch 2** (parallel after Batch 1 validates): Steps 2 + 3

**Batch 3** (sequential after Batch 2 validates): Step 4

**Batch 4** (parallel after Batch 3 validates): Steps 5 + 6

**Batch 5** (parallel after Batch 4.Step 6 validates): Steps 7 + 9

**Batch 6** (parallel after Batch 5.Step 7 validates): All Step 7b calls

**Batch 7** (after Batch 4.Step 5 + Batch 6 all validate): Step 8

**Batch 8**: Step 10 (assembly + final validation)

---

<a name="section-9"></a>
## Section 9 — Failure Modes to Design Around

### 1. Malformed JSON

**Risk level:** High for one-shot. Low per step in the pipeline.

**Root cause:** Long outputs cause truncation. Embedded HTML causes unescaped characters. Model "thinks" in markdown and wraps output in fences.

**Mitigation:**
- Smaller per-step output means JSON is under the token limit
- HTML is never embedded in JSON (Step 7b returns raw text)
- Every call instructs "Return raw valid JSON only. No markdown fences."
- Backend strips fence artifacts before JSON.parse() (`cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')`)
- Retry with explicit: "Your previous response was not valid JSON. Try again."

---

### 2. Duplicate or Invalid IDs

**Risk level:** Medium in one-shot. Very low in pipeline.

**Root cause:** In a large JSON, the model loses track of IDs it invented earlier.

**Mitigation:**
- Backend normalises all IDs to valid kebab-case on receipt
- Backend deduplicates IDs (appends `-2`, `-3` on conflict) before passing them to next steps
- Next steps receive the backend-normalised canonical ID list, so they can only reference what exists

---

### 3. Forward References (Referencing Entities Not Yet Created)

**Risk level:** High in one-shot. Eliminated in pipeline.

**Root cause:** In one-shot, the model tries to reference puzzle IDs in the event graph but hasn't generated them yet.

**Mitigation:**
- `puzzleId` in the event graph is replaced by `puzzleLabel` (a human-readable string)
- Puzzle IDs don't exist until Step 7, which comes after Step 6
- Backend resolves all labels to IDs during assembly, never the model
- Each step only receives IDs for entities that already exist

---

### 4. Culprit Logic Not Matching Clues

**Risk level:** High in one-shot. Medium in pipeline.

**Root cause:** In a large response, the model may drift from the intended culprit.

**Mitigation:**
- `culpritLabel` and `motive`/`method` are fixed in Step 1
- Step 4 explicitly instructed to create clues that support this specific motive and method
- Step 8 receives culprit identity + clue names and constructs narrative consistency
- Final validation checks: `truth.culpritId` exists in suspects; `truth.revealingClueIds` all exist and are `isRedHerring: false`

---

### 5. Timeline Contradictions That Are Not Intentional

**Risk level:** Medium.

**Root cause:** Model generates timeline independently of clue content, leading to real contradictions.

**Mitigation:**
- Step 5 is given `trueTimeline` from Step 1 as ground truth
- Backend checks: the crime moment appears as `isTrue: true`
- The culprit is not listed as `involvedSuspectIds` in the crime moment (they should have an alibi for that time)
- If inconsistency found: targeted repair prompt requesting correction of the specific timeline entry

---

### 6. Puzzles with Broken Scripts

**Risk level:** Very high in one-shot. Manageable in pipeline.

**Root cause:** Complex JS logic inside a JSON string, combined with context overflow.

**Mitigation:**
- Puzzles split into spec (Step 7) + HTML (Step 7b)
- HTML validated with multi-stage checks (parseable, postMessage present, no forbidden API calls)
- Sandbox test validates the postMessage actually fires
- Fallback: replace puzzle type with simpler type after 3 failures

---

### 7. Overlong Responses

**Risk level:** High in one-shot. Low per step.

**Root cause:** `maxOutputTokens: 8192` is not enough for a full case package.

**Mitigation:**
- Each step output is ~200–800 tokens
- `maxOutputTokens` can be tuned per step (Step 1: 800, Steps 2–4: 1200, Steps 5–8: 600, Step 9: 400, Step 7b: 2000)
- If a response is cut off (no closing `}` in JSON), immediately retry with shorter constraint

---

### 8. Repetitive Suspect Writing

**Risk level:** Medium.

**Root cause:** Small model repeats personality archetypes (the quiet butler, the scheming widow) without variation.

**Mitigation:**
- Step 1 generates `suspectLabels` as distinct functional roles (not character tropes)
- Step 2 prompt emphasises "Give each character a distinct personality, voice, and speech pattern. No two suspects should feel similar."
- Backend heuristic: if any two suspects share > 50% vocabulary overlap in `personality` field, trigger a targeted re-run for the less-distinctive suspect

---

### 9. Red Herrings Stronger Than the Real Clue Chain

**Risk level:** Medium.

**Root cause:** In a large one-shot response, the model sometimes accidentally writes red herring clues that are more logically specific than the guilt-chain clues.

**Mitigation:**
- Step 4 explicitly labels which clues are guilt-chain and which are red herrings
- The prompt requires: "Red herring clues should seem suspicious but point to a false conclusion. The guilt-chain clues should be stronger and more specific."
- Backend heuristic: `revealsInfo` of red herring clues should not directly name the culprit. Simple string check: if a red herring's `revealsInfo` contains the culprit's name, flag for review.
- Step 8 cross-references this and asks the model to explain why each red herring is weaker than the real chain

---

### 10. Inconsistent ID Casing

**Risk level:** High in one-shot. Backend-handled in pipeline.

**Root cause:** Model may generate `EleanorHargrove`, `eleanor_hargrove`, or `Eleanor-hargrove` for the same entity.

**Mitigation:**
- Backend normalises every model-produced ID: `id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`
- ID normalisation happens before any cross-reference injection, so downstream steps always receive canonical IDs

---

## Appendix A — generationConfig Recommendations Per Step

| Step | temperature | maxOutputTokens | responseMimeType |
|---|---|---|---|
| 1 — Foundation | 0.85 | 800 | `application/json` |
| 2 — Suspects | 0.85 | 1600 | `application/json` |
| 3 — Locations | 0.80 | 800 | `application/json` |
| 4 — Clues | 0.70 | 1000 | `application/json` |
| 5 — Timeline | 0.75 | 600 | `application/json` |
| 6 — Event Graph | 0.65 | 1000 | `application/json` |
| 7 — Puzzle Specs | 0.70 | 600 | `application/json` |
| 7b — Puzzle HTML | 0.60 | 2000 | `text/plain` |
| 8 — Hints + Solution | 0.85 | 1200 | `application/json` |
| 9 — Visual | 0.80 | 600 | `application/json` |

---

## Appendix B — LlmService Refactoring Notes

The existing `LlmService.generateCasePackage()` method should be replaced with a `MultiStepCaseGenerator` pattern. Suggested structure:

```typescript
// services/case-generator.service.ts
@Injectable({ providedIn: 'root' })
export class CaseGeneratorService {
  generateCase(difficulty: Difficulty, style: string): Observable<CasePackage> {
    return this.step1_foundation(difficulty, style).pipe(
      switchMap(foundation => forkJoin({
        suspects: this.step2_suspects(foundation),
        locations: this.step3_locations(foundation),
      })),
      switchMap(({ suspects, locations }) =>
        this.step4_clues(foundation, suspects, locations).pipe(
          map(clues => ({ suspects, locations, clues }))
        )
      ),
      switchMap(({ suspects, locations, clues }) => forkJoin({
        timeline: this.step5_timeline(foundation, suspects),
        events: this.step6_eventGraph(foundation, suspects, clues),
      }).pipe(map(({ timeline, events }) => ({ suspects, locations, clues, timeline, events })))),
      switchMap(parts =>
        forkJoin({
          puzzleSpecs: this.step7_puzzleSpecs(parts.events, parts.clues, foundation),
          visual: this.step9_visual(foundation, style),
        }).pipe(map(({ puzzleSpecs, visual }) => ({ ...parts, puzzleSpecs, visual })))
      ),
      switchMap(parts =>
        forkJoin(
          parts.puzzleSpecs.map(spec => this.step7b_puzzleHtml(spec))
        ).pipe(map(htmlResults => ({ ...parts, puzzleHtml: htmlResults })))
      ),
      switchMap(parts =>
        this.step8_hintsAndSolution(foundation, parts.suspects, parts.clues, parts.events).pipe(
          map(hintAndSolution => ({ ...parts, hintAndSolution }))
        )
      ),
      map(parts => this.assembler.assemble(parts)),
      switchMap(pkg => {
        const result = this.validator.validate(pkg);
        if (result.valid) return of(pkg);
        return this.repair(pkg, result.errors);
      }),
    );
  }
}
```

The existing `LlmService` can be kept as the low-level HTTP wrapper (`callLlm(prompt, config)`). The new `CaseGeneratorService` orchestrates the multi-step flow above.

The existing validation logic in `LlmService.validateCrossReferences()` moves to a separate `CaseValidatorService` and is called at Step 10, with per-step validators added inline within each step method.

---

*Last updated: Architecture v2 — Multi-Step Pipeline Design (Gemma-optimised)*
