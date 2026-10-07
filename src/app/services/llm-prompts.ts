/**
 * Pure prompt-builder functions for every LLM generation step.
 * No Angular dependencies — inputs in, prompt string out.
 */

import { Suspect, UITheme } from '../models';
import {
  Difficulty,
  CaseFoundation,
  LocationSpec,
  CluesResult,
  EventSpec,
  PuzzleConcept,
} from './llm-generation.types';

const SURPRISE_ME_OPTION = 'Surprise Me';

function isSurpriseMeStyle(style: string): boolean {
  return style.trim() === SURPRISE_ME_OPTION;
}

function foundationStyleInstruction(style: string): string {
  if (!isSurpriseMeStyle(style)) {
    return `ART STYLE: ${style}\n`;
  }

  return (
    `ART STYLE MODE: Surprise Me\n` +
    `Invent a distinctive original visual style for this case instead of using a stock preset. ` +
    `Choose a style that fits the setting, tone, and mystery structure, and keep it coherent across ` +
    `character portraits, locations, clues, UI theming, and puzzle presentation.\n`
  );
}

function styleReference(style: string): string {
  return isSurpriseMeStyle(style) ? 'an original visual style you invent for this case' : style;
}

function imagePromptTemplate(style: string, subjectTemplate: string): string {
  return isSurpriseMeStyle(style)
    ? `<image prompt matching the original visual style you invent for this case: ${subjectTemplate}>`
    : `${style}, ${subjectTemplate}`;
}

// ── Step 1 — Case Foundation ──────────────────────────────────────────────────

export function buildFoundationPrompt(
  difficulty: Difficulty,
  style: string,
  seed: number,
  caseType: CaseFoundation['caseType'],
): string {
  const guide: Record<Difficulty, string> = {
    easy: '3 suspects. Simple case — obvious motive. Culprit identifiable from Act 1 alone.',
    normal: '5 suspects. Moderate complexity — layered motive. Culprit clear after Act 2.',
    hard: '5 suspects. Complex — obscured motive, misdirection. Culprit only clear in Act 3.',
    genius:
      '5 suspects. Masterwork — all suspects plausible, multiple twists, truth requires cross-referencing everything.',
  };
  const suspectCount: Record<Difficulty, number> = { easy: 3, normal: 5, hard: 5, genius: 5 };

  return (
    `You are designing a UNIQUE detective mystery for an interactive game called "The Last Alibi".\n` +
    `DIFFICULTY: ${difficulty} — ${guide[difficulty]}\n` +
    foundationStyleInstruction(style) +
    `CREATIVITY SEED: ${seed} — use this to produce a completely original, unexpected scenario.\n` +
    `CASE TYPE (fixed): ${caseType} — the crime MUST be a ${caseType}. Build your entire scenario around this.\n\n` +
    `CRITICAL: Invent a wholly ORIGINAL case. Do NOT use "manor house murder", Victorian settings,\n` +
    `jealous sisters, or any other cliché. The setting, crime type, era, and cast must be fresh.\n\n` +
    `Output ONLY a raw JSON object. No markdown fences, no explanation.\n` +
    `ALL string values below are FORMAT PLACEHOLDERS — replace every one with original content.\n\n` +
    `{\n` +
    `  "caseSlug": "<your-unique-kebab-slug>",\n` +
    `  "title": "<Your Original Case Title>",\n` +
    `  "subtitle": "<one-line tagline>",\n` +
    `  "caseType": "${caseType}",\n` +
    `  "setting": "<original setting — era, location, atmosphere>",\n` +
    `  "briefing": "<2-3 sentences the detective reads on arrival>",\n` +
    `  "act1Summary": "<what the player discovers in Act 1>",\n` +
    `  "act2Summary": "<what deepens in Act 2>",\n` +
    `  "act3Summary": "<how truth crystallises in Act 3>",\n` +
    `  "culpritLabel": "<role or description of the guilty party>",\n` +
    `  "motive": "<specific motive>",\n` +
    `  "method": "<specific method>",\n` +
    `  "trueTimeline": "<paragraph: what actually happened step-by-step>",\n` +
    `  "keyContradiction": "<the single fact that exposes the culprit>",\n` +
    `  "redHerringExplanation": "<why the red herring seemed guilty but was not>",\n` +
    `  "suspectLabels": ["<role 1>", "<role 2>", "<more roles>"],\n` +
    `  "lyingSuspectLabels": ["<role>"],\n` +
    `  "mistakenSuspectLabels": ["<role>"],\n` +
    `  "hidingSecretSuspectLabels": ["<role>"]\n` +
    `}\n\n` +
    `Constraints:\n` +
    `- Replace ALL angle-bracket placeholders with real original values\n` +
    `- caseSlug must be kebab-case derived from your title\n` +
    `- culpritLabel must appear verbatim in suspectLabels\n` +
    `- suspectLabels must have exactly ${suspectCount[difficulty]} entries\n` +
    `- lyingSuspectLabels, mistakenSuspectLabels, hidingSecretSuspectLabels are subsets of suspectLabels\n` +
    `- caseType is already set to "${caseType}" — do not change it`
  );
}

// ── Step 2 — Suspects ─────────────────────────────────────────────────────────

export function buildSuspectsPrompt(f: CaseFoundation, style: string): string {
  return (
    `Generate all suspects for the detective mystery "${f.title}" (${f.setting}).\n` +
    `Visual style reference: ${styleReference(style)}.\n` +
    `The culprit is the suspect matching label "${f.culpritLabel}".\n` +
    `SECRET GROUND TRUTH (keep every suspect consistent with it): ${f.trueTimeline}\n` +
    `Method: ${f.method}. Motive: ${f.motive}.\n` +
    `The fact that exposes the culprit (ONLY the culprit's lie may touch this): ${f.keyContradiction}\n\n` +
    `Suspect labels: ${f.suspectLabels.map((l, i) => `${i + 1}. "${l}"`).join('; ')}\n` +
    `lyingSuspectLabels: ${JSON.stringify(f.lyingSuspectLabels)}\n` +
    `mistakenSuspectLabels: ${JSON.stringify(f.mistakenSuspectLabels)}\n` +
    `hidingSecretSuspectLabels: ${JSON.stringify(f.hidingSecretSuspectLabels)}\n\n` +
    `Output ONLY raw JSON. No markdown fences.\n\n` +
    `{\n` +
    `  "culpritSuspectId": "<the exact id you give the culprit below>",\n` +
    `  "suspects": [\n` +
    `    {\n` +
    `      "id": "suspect-<kebab-case>",\n` +
    `      "name": "Full Name",\n` +
    `      "age": 35,\n` +
    `      "occupation": "job title",\n` +
    `      "relationship": "relationship to victim",\n` +
    `      "description": "physical appearance and first impression",\n` +
    `      "personality": "key character traits",\n` +
    `      "alibi": "what they claim they were doing at time of crime",\n` +
    `      "secretUnrelatedToCase": "embarrassing personal secret unrelated to the crime",\n` +
    `      "isLying": false,\n` +
    `      "isMistaken": false,\n` +
    `      "isHidingSecret": false,\n` +
    `      "trueWhereabouts": "where they ACTUALLY were and what they actually did during the crime",\n` +
    `      "lieAbout": "if isLying: the specific thing THIS suspect lies about and why; otherwise empty string",\n` +
    `      "mistakenBelief": "if isMistaken: the specific thing they honestly misremember; otherwise empty string",\n` +
    `      "knownFacts": ["2-3 things they genuinely saw or know that bear on the case"],\n` +
    `      "interviewDialogue": [\n` +
    `        { "speakerId": "suspect-id", "speakerName": "Name", "text": "interview line", "revealsTruth": false },\n` +
    `        { "speakerId": "suspect-id", "speakerName": "Name", "text": "interview line", "revealsTruth": true },\n` +
    `        { "speakerId": "suspect-id", "speakerName": "Name", "text": "interview line", "revealsTruth": false },\n` +
    `        { "speakerId": "suspect-id", "speakerName": "Name", "text": "interview line", "revealsTruth": false }\n` +
    `      ],\n` +
    `      "imagePrompt": "${imagePromptTemplate(style, 'portrait of [name], [occupation], dramatic lighting')}"\n` +
    `    }\n` +
    `  ]\n` +
    `}\n\n` +
    `Rules:\n` +
    `- The suspect matching culpritLabel MUST have isLying: true\n` +
    `- Suspects with matching lyingSuspectLabels also have isLying: true\n` +
    `- Suspects with matching mistakenSuspectLabels have isMistaken: true\n` +
    `- Suspects with matching hidingSecretSuspectLabels have isHidingSecret: true\n` +
    `- culpritSuspectId MUST be exactly the id of the culprit's entry in suspects\n` +
    `- Every innocent liar lies about something of their OWN (an affair, a debt, being somewhere they shouldn't) — never about the culprit's exposing fact\n` +
    `- trueWhereabouts, alibi and knownFacts must all agree with the ground truth; for the culprit, alibi is the false story and trueWhereabouts is what really happened\n` +
    `- Each suspect has exactly 4 interviewDialogue entries\n` +
    `- speakerId in each dialogue entry must match that suspect's id`
  );
}

// ── Step 3 — Locations ────────────────────────────────────────────────────────

export function buildLocationsPrompt(f: CaseFoundation, style: string): string {
  return (
    `Generate exactly 5 locations for the detective mystery "${f.title}" (${f.setting}).\n` +
    `Visual style reference: ${styleReference(style)}.\n` +
    `Do NOT include a "cluesFoundHere" field.\n\n` +
    `Output ONLY raw JSON. No markdown fences.\n\n` +
    `{\n` +
    `  "locations": [\n` +
    `    {\n` +
    `      "id": "location-<kebab-case>",\n` +
    `      "name": "location name",\n` +
    `      "description": "what the detective observes here",\n` +
    `      "atmosphere": "sensory details — smell, light, sound",\n` +
    `      "imagePrompt": "${imagePromptTemplate(style, 'interior or exterior scene, [name], [atmosphere details]')}"\n` +
    `    }\n` +
    `  ]\n` +
    `}\n\n` +
    `Generate exactly 5 locations specific to ${f.setting}.`
  );
}

// ── Step 4 — Clues ────────────────────────────────────────────────────────────

export function buildCluesPrompt(
  f: CaseFoundation,
  culpritSuspectId: string,
  suspects: Suspect[],
  locations: LocationSpec[],
  style: string,
): string {
  const culpritName = suspects.find((s) => s.id === culpritSuspectId)?.name ?? 'the culprit';
  const locationIds = locations.map((l) => l.id).join(', ');
  const clueCount = f.suspectLabels.length <= 3 ? 6 : f.suspectLabels.length <= 4 ? 9 : 10;

  return (
    `Generate exactly ${clueCount} clues for the detective mystery "${f.title}".\n` +
    `Setting: ${f.setting}\n` +
    `Visual style reference: ${styleReference(style)}.\n` +
    `Culprit: ${culpritName} — method: ${f.method}\n` +
    `Key contradiction: ${f.keyContradiction}\n\n` +
    `Available location IDs (use exactly these as locationId values):\n` +
    `${locationIds}\n\n` +
    `Output ONLY raw JSON. No markdown fences.\n\n` +
    `{\n` +
    `  "clues": [\n` +
    `    {\n` +
    `      "id": "clue-<kebab-case>",\n` +
    `      "name": "short evidence name",\n` +
    `      "description": "one sentence of what the detective observes",\n` +
    `      "locationId": "<must be from the list above>",\n` +
    `      "isRedHerring": false,\n` +
    `      "revealsInfo": "what this clue logically tells the detective",\n` +
    `      "imagePrompt": "${imagePromptTemplate(style, 'close-up still life, [name], [physical description]')}"\n` +
    `    }\n` +
    `  ],\n` +
    `  "culpritClueIds": ["<2-3 clue ids that form the chain of evidence proving guilt>"],\n` +
    `  "redHerringClueIds": ["<ids of clues with isRedHerring: true>"],\n` +
    `  "importantClueId": "<the single most damning clue — must be in culpritClueIds>"\n` +
    `}\n\n` +
    `Rules:\n` +
    `- At least 2 clues must have isRedHerring: true (and be listed in redHerringClueIds)\n` +
    `- culpritClueIds must NOT overlap with redHerringClueIds\n` +
    `- importantClueId must be in culpritClueIds\n` +
    `- All locationId values must be from the list above`
  );
}

// ── Step 5 — Timeline ─────────────────────────────────────────────────────────

export function buildTimelinePrompt(f: CaseFoundation, suspects: Suspect[]): string {
  const suspectIds = suspects.map((s) => s.id).join(', ');

  return (
    `Generate exactly 10 timeline entries for the mystery "${f.title}".\n` +
    `Setting: ${f.setting}\n` +
    `True events: ${f.trueTimeline}\n\n` +
    `Available suspect IDs: ${suspectIds}\n\n` +
    `Output ONLY raw JSON. No markdown fences.\n\n` +
    `{\n` +
    `  "timeline": [\n` +
    `    {\n` +
    `      "id": "timeline-<kebab-case>",\n` +
    `      "time": "7:30 PM",\n` +
    `      "description": "one sentence about this event",\n` +
    `      "involvedSuspectIds": [],\n` +
    `      "isTrue": true\n` +
    `    }\n` +
    `  ]\n` +
    `}\n\n` +
    `Rules:\n` +
    `- Exactly 10 entries\n` +
    `- At least 6 isTrue: true, at least 2 isTrue: false (false = rumour or misdirection)\n` +
    `- The actual moment of the crime MUST appear as isTrue: true\n` +
    `- Use only the suspect IDs listed above in involvedSuspectIds`
  );
}

// ── Step 6 — Event Graph ──────────────────────────────────────────────────────

export function buildEventGraphPrompt(
  f: CaseFoundation,
  suspects: Suspect[],
  culpritSuspectId: string,
  clues: CluesResult,
  difficulty: Difficulty,
): string {
  const suspectIds = suspects.map((s) => s.id).join(', ');
  const clueIds = clues.clues.map((c) => c.id).join(', ');
  const puzzleCount: Record<Difficulty, number> = { easy: 1, normal: 2, hard: 2, genius: 3 };

  return (
    `Generate the investigation event graph for "${f.title}".\n` +
    `Setting: ${f.setting}\n` +
    `Act 1: ${f.act1Summary}\n` +
    `Act 2: ${f.act2Summary}\n` +
    `Act 3: ${f.act3Summary}\n` +
    `Culprit suspect ID: ${culpritSuspectId}\n` +
    `Key clues proving guilt: ${clues.culpritClueIds.join(', ')}\n\n` +
    `Available suspect IDs: ${suspectIds}\n` +
    `Available clue IDs: ${clueIds}\n\n` +
    `Output ONLY raw JSON. No markdown fences.\n\n` +
    `{\n` +
    `  "events": [\n` +
    `    {\n` +
    `      "id": "event-<kebab-case>",\n` +
    `      "category": "investigation",\n` +
    `      "type": "searchRoom",\n` +
    `      "title": "player-facing title",\n` +
    `      "description": "one sentence teaser",\n` +
    `      "act": 1,\n` +
    `      "isMandatory": true,\n` +
    `      "unlockConditions": [],\n` +
    `      "rewardsClueIds": [],\n` +
    `      "unlocksSuspectIds": [],\n` +
    `      "puzzleLabel": null,\n` +
    `      "dialogueSuspectId": null,\n` +
    `      "narration": "2-3 sentence scene description",\n` +
    `      "examinationSpots": [\n` +
    `        { "id": "spot-bookshelf", "label": "Dusty Bookshelf", "description": "Rows of untouched volumes — except one gap where a book was recently removed.", "rewardsClueId": null },\n` +
    `        { "id": "spot-window", "label": "Cracked Window", "description": "The latch is broken from the inside. Someone left in a hurry.", "rewardsClueId": null },\n` +
    `        { "id": "spot-desk-drawer", "label": "Locked Desk Drawer", "description": "A crumpled receipt jammed under the lock reveals a meeting time.", "rewardsClueId": "clue-id-here" },\n` +
    `        { "id": "spot-fireplace", "label": "Cold Fireplace", "description": "Ash is fresh — something was burned within the last hour.", "rewardsClueId": null }\n` +
    `      ]\n` +
    `    }\n` +
    `  ]\n` +
    `}\n\n` +
    `Rules:\n` +
    `- Generate 8-12 events spread across acts 1, 2, and 3\n` +
    `- Act 1 must have at least 2 events with unlockConditions: []\n` +
    `- category: "investigation"|"social"|"surprise"|"puzzle"|"deduction"\n` +
    `- Social events must have dialogueSuspectId set to a valid suspect id; all OTHER categories must have dialogueSuspectId: null\n` +
    `- Every suspect should have their own social event (one interview per suspect)\n` +
    `- Generate exactly ${puzzleCount[difficulty]} event(s) with category "puzzle"; these must have puzzleLabel set to a short kebab-case label (e.g. "desk-cipher"), NOT null\n` +
    `- Every puzzle event must have exactly 1 rewardsClueIds entry; that clue is the evidence unlocked by solving the puzzle\n` +
    `- All rewardsClueIds must be from the clue IDs list\n` +
    `- All dialogueSuspectId and unlocksSuspectIds values must be from the suspect IDs list\n` +
    `- unlockConditions: type "event_completed" (referenceId = an event id in this array), "clue_found" (referenceId = a clue id), or "act_reached" (referenceId = "2" or "3")\n` +
    `- An event may only depend on events or clues from the SAME or an EARLIER act — never a later one\n` +
    `- Every act (1, 2 and 3) must contain at least one event with isMandatory: true; the act ends when all its mandatory events are done\n` +
    `- Do NOT create circular unlock conditions\n` +
    `- Key culprit clues (${clues.culpritClueIds.join(', ')}) should be rewards in Act 2-3 events\n` +
    `- Every event with category "investigation" MUST include an "examinationSpots" array with exactly 4-6 spots\n` +
    `- Each spot must have: "id" (kebab-case, unique within the event), "label" (2-4 words), "description" (1-2 atmospheric sentences, either a dead end or a clue reveal), "rewardsClueId" (a clue ID string OR null)\n` +
    `- Investigation events: 1-3 spots should have a non-null rewardsClueId; remaining spots are atmospheric dead ends\n` +
    `- Prefer awarding clues through investigation spots; social events should rarely award clues\n` +
    `- rewardsClueId values in spots must match the event's own rewardsClueIds array entries (one spot per rewarded clue)\n` +
    `- Social, puzzle, surprise, and deduction events must have examinationSpots: null\n` +
    `\nCRITICAL COVERAGE REQUIREMENT — the player must be able to discover everything by the end of Act 3:\n` +
    `- EVERY suspect ID (${suspectIds}) must appear in at least one event: either as a dialogueSuspectId OR inside an event's unlocksSuspectIds. No suspect may be permanently hidden.\n` +
    `- EVERY clue ID (${clueIds}) must appear in at least one event's rewardsClueIds. No clue may be permanently undiscoverable.\n` +
    `- Spread suspect and clue unlocks across all three acts for a sense of progression. Do not dump everything in Act 1.\n` +
    `- By the end of Act 3, completing all events must guarantee the player has seen every suspect and found every clue.`
  );
}

// ── Step 7 — Puzzle Concept ───────────────────────────────────────────────────

export function buildPuzzleConceptPrompt(
  f: CaseFoundation,
  clues: CluesResult,
  event: EventSpec & { puzzleLabel: string },
): string {
  const label = event.puzzleLabel;
  const puzzleId = `puzzle-${label}`;
  const rewardedClueId = event.rewardsClueIds[0] ?? clues.importantClueId;
  const rewardedClue =
    clues.clues.find((c) => c.id === rewardedClueId) ??
    clues.clues.find((c) => c.id === clues.importantClueId) ??
    null;
  const availableClueIds = clues.clues.map((c) => c.id).join(', ');
  const unlockSummary =
    event.unlockConditions.length > 0
      ? event.unlockConditions.map((c) => `${c.type}:${c.referenceId}`).join(', ')
      : 'none';
  const clueCatalog = clues.clues
    .map((c) => `- ${c.id}: ${c.name} | ${c.description} | reveals: ${c.revealsInfo}`)
    .join('\n');

  return (
    `Generate a single puzzle concept for the detective mystery "${f.title}" (${f.setting}).\n` +
    `Event title: ${event.title}\n` +
    `Event description: ${event.description}\n` +
    `Event narration: ${event.narration}\n` +
    `Unlock conditions already met before this puzzle: ${unlockSummary}\n` +
    `Puzzle label: ${label}\n` +
    `Required puzzle id: ${puzzleId}\n\n` +
    `Reward clue for this puzzle is FIXED: ${rewardedClueId}${rewardedClue ? ` (${rewardedClue.name}: ${rewardedClue.revealsInfo})` : ''}\n` +
    `Available clue IDs for rewards: ${availableClueIds}\n\n` +
    `Available evidence and clue context:\n${clueCatalog}\n\n` +
    `Your goal in this step is to ensure this puzzle has real logic, embedded clues, and a clearly intended solution before any HTML is written.\n` +
    `The player must be able to solve it from the text clues and instructions alone; the HTML is only supplemental presentation.\n` +
    `The answer must be DERIVABLE, not guessed. Every part of the solution must come from player-visible information.\n` +
    `If the answer is numeric, explain exactly where each digit or number chunk comes from. If the answer is textual, explain exactly how the letters/word are obtained.\n` +
    `Do NOT invent hidden transformations, arbitrary cipher shifts, unstated math, or brute-force-only solutions.\n` +
    `Do NOT use a Caesar cipher, substitution rule, or other encoding scheme unless the visible clues explicitly provide the ciphertext and the information needed to decode it.\n` +
    `Output ONLY raw JSON. No markdown fences.\n\n` +
    `{\n` +
    `  "label": "${label}",\n` +
    `  "id": "${puzzleId}",\n` +
    `  "rewardedClueId": "${rewardedClueId}",\n` +
    `  "puzzleTitle": "The Brass Box Cipher",\n` +
    `  "puzzleType": "cipher",\n` +
    `  "puzzleDescription": "what the player sees when the puzzle opens, 1-2 sentences",\n` +
    `  "puzzleLogic": "the internal reasoning structure and how the clues lead to the answer",\n` +
    `  "derivationSteps": ["step 1 showing how the first clue is used", "step 2 showing how that produces the answer or part of it"],\n` +
    `  "interactionInstructions": "clear player-facing instructions for how to use the clues and what to submit",\n` +
    `  "clues": ["explicit clue the player can inspect", "second clue that supports the logic", "optional third clue"],\n` +
    `  "answerPrompt": "short label above the answer field",\n` +
    `  "answerPlaceholder": "example of the expected input shape",\n` +
    `  "answerFormat": "exact format the player should enter, such as a word, phrase, or ordered sequence",\n` +
    `  "solution": "the exact intended answer or final state the player must reach",\n` +
    `  "acceptableAnswers": ["canonical answer", "allowed alternate spacing or punctuation variant"],\n` +
    `  "validationLogic": "the exact rule the HTML implementation should use to decide the puzzle is solved",\n` +
    `  "uiConcept": "a short description of the interface layout and interaction style",\n` +
    `  "hints": ["vague hint", "more specific", "points toward solution", "nearly explicit"]\n` +
    `}\n\n` +
    `Rules:\n` +
    `- label must be exactly ${label}\n` +
    `- id must be exactly ${puzzleId}\n` +
    `- puzzleType: "cipher"|"lock"|"pattern"|"fragment"|"logic_grid"|"sequence"|"map"|"mechanical"\n` +
    `- rewardedClueId must be exactly ${rewardedClueId}\n` +
    `- clues must contain 2-5 concrete puzzle clues the player can reason from without outside knowledge\n` +
    `- puzzleLogic must describe how the puzzle actually works, not just its theme\n` +
    `- derivationSteps must contain 2-6 explicit steps that show exactly how the answer is derived from the visible clues\n` +
    `- No derivation step may rely on hidden information, external knowledge, or "notice a pattern" without stating the actual pattern\n` +
    `- If the answer is a number, the derivationSteps must explain exactly how each digit or digit group is obtained\n` +
    `- If you mention a cipher, code, shift, mapping, subtraction, addition, ordering rule, or extraction rule, the clues must explicitly contain enough information for the player to perform it\n` +
    `- interactionInstructions must make the required player action unambiguous\n` +
    `- answerPrompt and answerPlaceholder must help the player understand what to type\n` +
    `- answerFormat must describe the exact expected syntax\n` +
    `- solution must be explicit and fully solvable from the clues in the concept\n` +
    `- acceptableAnswers must contain 1-6 exact strings the host validator may accept, including the canonical solution\n` +
    `- validationLogic must clearly define what exact player action or answer counts as solved\n` +
    `- uiConcept must describe a simple HTML-friendly interface\n` +
    `- hints must contain 3-5 entries\n` +
    `- Choose a puzzle type that fits the ${f.setting} setting`
  );
}

// ── Step 7b — Puzzle HTML ─────────────────────────────────────────────────────

export function buildPuzzleHtmlPrompt(
  concept: PuzzleConcept,
  style: string,
  theme: UITheme,
): string {
  return (
    `Create a self-contained HTML puzzle for a detective mystery game based on this validated puzzle concept.\n\n` +
    `Puzzle title: ${concept.puzzleTitle}\n` +
    `Type: ${concept.puzzleType}\n` +
    `What the player sees: ${concept.puzzleDescription}\n` +
    `Puzzle logic: ${concept.puzzleLogic}\n` +
    `Exact derivation steps: ${concept.derivationSteps.join(' | ')}\n` +
    `Player instructions: ${concept.interactionInstructions}\n` +
    `Embedded clues: ${concept.clues.join(' | ')}\n` +
    `Answer prompt: ${concept.answerPrompt}\n` +
    `Answer placeholder: ${concept.answerPlaceholder}\n` +
    `Answer format: ${concept.answerFormat}\n` +
    `Intended solution: ${concept.solution}\n` +
    `Accepted answers for the host validator: ${concept.acceptableAnswers.join(' | ')}\n` +
    `Validation logic: ${concept.validationLogic}\n` +
    `UI concept: ${concept.uiConcept}\n` +
    `Puzzle ID: ${concept.id}\n\n` +
    `Requirements:\n` +
    `- Complete valid HTML document starting with <!DOCTYPE html>\n` +
    `- ALL CSS and JS inline (no external files, no CDN links)\n` +
    `- Use the game theme as the source palette: page background ${theme.primaryColor}, panel/card background ${theme.secondaryColor}, accent/highlight color ${theme.accentColor}, surface color ${theme.surfaceColor}, body text ${theme.textColor}\n` +
    `- Readability is more important than strict palette fidelity. You may darken/lighten derived shades or add subtle overlays so long as the result still clearly matches the supplied palette\n` +
    `- Atmosphere matches: ${styleReference(style)}\n` +
    `- The host application already shows the clues, instructions, hints, and answer submission UI; this HTML is supplemental presentation only\n` +
    `- MUST visually reinforce the same puzzle logic and clues from the concept above\n` +
    `- MUST NOT introduce any new rules, hidden clues, or required knowledge that are absent from the concept\n` +
    `- The player must be able to infer the answer from the visible content above without brute force; the HTML should make the derivation easier to see, not more obscure\n` +
    `- You MAY include internal interactive controls, but they are optional because the host owns answer submission\n` +
    `- If the HTML includes an internal solved state, it MUST call: window.parent.postMessage({type:"PUZZLE_SOLVED",puzzleId:"${concept.id}"},"*") exactly once when solved\n` +
    `- Must be solvable without outside knowledge and without inventing extra hidden rules\n` +
    `- No localStorage, sessionStorage, or cookies\n` +
    `- No alert() or confirm()\n` +
    `- Show a clear visual success state when solved\n` +
    `- Every visible text element must remain readable at a glance. Essential text must have strong contrast against its background; target WCAG AA at minimum and prefer ~7:1 for body text\n` +
    `- Do NOT use low-opacity text for body copy, clues, instructions, labels, form inputs, buttons, or success messages\n` +
    `- Do NOT place accent-colored text on light accent-tinted panels unless you have verified strong contrast. Prefer near-white text on dark surfaces or near-black text on light surfaces for body copy\n` +
    `- Inputs, buttons, clue lists, and explanatory copy must all be clearly legible without zooming. Avoid washed-out beige on light gray, muted gold on cream, or any similar low-contrast combination\n` +
    `- Use a minimum body font size of 16px and line-height of at least 1.4 for prose and clue text\n` +
    `- ABSOLUTELY NO <img> tags, no <image> tags, no base64 data URIs, no SVG images — text and CSS only\n` +
    `- Do NOT embed any binary data or base64 encoded content of any kind\n` +
    `- Keep the HTML under 240 lines total\n\n` +
    `Output ONLY the raw HTML. No JSON wrapper, no markdown fences, no explanation.`
  );
}

// ── Step 8 — Hint Ladder & Solution ──────────────────────────────────────────

export function buildHintLadderPrompt(
  f: CaseFoundation,
  suspects: Suspect[],
  culpritSuspectId: string,
  clues: CluesResult,
  events: EventSpec[],
): string {
  const culpritName = suspects.find((s) => s.id === culpritSuspectId)?.name ?? 'the culprit';
  const eventIds = events.map((e) => e.id).join(', ');
  const redHerringCount = clues.redHerringClueIds.length;

  return (
    `Generate the hint ladder and solution explanation for "${f.title}".\n` +
    `Culprit: ${culpritName} — motive: ${f.motive}\n` +
    `Method: ${f.method}\n` +
    `Key contradiction: ${f.keyContradiction}\n` +
    `Truth: ${f.trueTimeline}\n\n` +
    `Available event IDs (for targetsEventId): ${eventIds}\n\n` +
    `Output ONLY raw JSON. No markdown fences.\n\n` +
    `{\n` +
    `  "hintLadder": [\n` +
    `    { "index": 0, "text": "very vague — do not name suspects or evidence", "targetsEventId": null },\n` +
    `    { "index": 1, "text": "slightly more specific", "targetsEventId": null },\n` +
    `    { "index": 2, "text": "points toward a general area of investigation", "targetsEventId": null },\n` +
    `    { "index": 3, "text": "narrows down the method or motive", "targetsEventId": null },\n` +
    `    { "index": 4, "text": "nearly explicit — almost names the culprit", "targetsEventId": null }\n` +
    `  ],\n` +
    `  "solutionExplanation": {\n` +
    `    "narrative": "3-5 sentence prose of the full truth, written like the end of a detective novel",\n` +
    `    "stepsExplained": [\n` +
    `      "the inciting event",\n` +
    `      "how the culprit planned or acted",\n` +
    `      "how they tried to cover it up",\n` +
    `      "the key contradiction that exposes them",\n` +
    `      "the final conclusion"\n` +
    `    ],\n` +
    `    "redHerringExplanations": [${Array(redHerringCount).fill('"explanation sentence"').join(', ')}]\n` +
    `  }\n` +
    `}\n\n` +
    `if targetsEventId is set, it must be one of: ${eventIds}`
  );
}

// ── Step 9 — Visual Theme ─────────────────────────────────────────────────────

export function buildVisualThemePrompt(f: CaseFoundation, style: string): string {
  return (
    `You are generating a visual theme and UI color scheme for the detective mystery "${f.title}".\n` +
    `Style request: "${styleReference(style)}" | Setting: ${f.setting} | Case type: ${f.caseType}\n\n` +
    (isSurpriseMeStyle(style)
      ? `Because the player selected Surprise Me, you must INVENT a fresh visual direction for this case rather than echoing a common preset. Make it specific, memorable, and strongly matched to this mystery's setting.\n\n`
      : '') +
    `STEP 1 — DECIDE THEME BRIGHTNESS\n` +
    `Based on "${styleReference(style)}", decide if the UI should be DARK (dark backgrounds, light text) or\n` +
    `LIGHT (light/pale backgrounds, dark text). Write your decision before the JSON as a comment, then follow it.\n\n` +
    `STEP 2 — PICK COLORS THAT MATCH YOUR DECISION\n` +
    `For DARK themes: primaryColor luminance ≤ 0.15, textColor luminance ≥ 0.60\n` +
    `For LIGHT themes: primaryColor luminance ≥ 0.60, textColor luminance ≤ 0.20\n` +
    `Luminance of #rrggbb = 0.2126*(r/255)^2.2 + 0.7152*(g/255)^2.2 + 0.0722*(b/255)^2.2 (simplified sRGB)\n\n` +
    `STEP 3 — VERIFY CONTRAST BEFORE OUTPUTTING\n` +
    `Verify ALL of these pairs pass WCAG AA (contrast ratio ≥ 4.5:1):\n` +
    `  A) textColor on primaryColor  (body text on page background)\n` +
    `  B) textColor on secondaryColor (body text on card/panel backgrounds)\n` +
    `  C) textColor on surfaceColor  (body text on elevated surfaces)\n` +
    `  D) accentColor on primaryColor (headings/labels on page background)\n` +
    `  E) accentColor on secondaryColor (headings on cards)\n` +
    `  F) accentColor on surfaceColor (headings on elevated surfaces)\n` +
    `Contrast ratio = (L1+0.05)/(L2+0.05) where L1 is the lighter luminance.\n` +
    `If any pair fails, adjust until all six pass.\n` +
    `Do NOT choose muted mid-tone combinations that technically pass only in large text but become unreadable for small labels, clue cards, or generated puzzle UI.\n\n` +
    `Output ONLY raw JSON. No markdown fences. No comments inside the JSON.\n` +
    `Replace every placeholder in angle brackets with a real value.\n\n` +
    `{\n` +
    `  "visualDirection": {\n` +
    `    "artStyle": "<short description of the visual style>",\n` +
    `    "mood": "<emotional mood>",\n` +
    `    "colorPalette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],\n` +
    `    "lightingStyle": "<describe lighting>",\n` +
    `    "renderingStyle": "<describe rendering approach>",\n` +
    `    "globalStylePrompt": "<compact Imagen style prefix for all images>",\n` +
    `    "negativePrompt": "<things to avoid in all images>"\n` +
    `  },\n` +
    `  "uiTheme": {\n` +
    `    "primaryColor": "<#rrggbb — page background>",\n` +
    `    "secondaryColor": "<#rrggbb — panel/card background, same dark/light direction as primary>",\n` +
    `    "accentColor": "<#rrggbb — heading/highlight color, ≥4.5:1 on both primary and secondary>",\n` +
    `    "surfaceColor": "<#rrggbb — elevated surface, same dark/light direction as primary>",\n` +
    `    "textColor": "<#rrggbb — body text, ≥4.5:1 on primary, secondary, AND surface>",\n` +
    `    "panelStyle": "<flat|raised|inset>",\n` +
    `    "borderStyle": "<e.g. 1px solid rgba(r,g,b,0.35)>",\n` +
    `    "shadowStyle": "<e.g. 0 4px 24px rgba(0,0,0,0.5)>",\n` +
    `    "textureFamily": "<paper|grain|cork|metal|leather|fabric|pixel_noise>"\n` +
    `  },\n` +
    `  "imagePromptTemplates": {\n` +
    `    "suspectPortrait": "${imagePromptTemplate(style, 'portrait of {name}, {occupation}, {description}, dramatic lighting')}",\n` +
    `    "locationScene": "${imagePromptTemplate(style, '{name}, {atmosphere}, cinematic')}",\n` +
    `    "clueObject": "${imagePromptTemplate(style, 'still life, {name}, {description}, moody')}",\n` +
    `    "eventSplash": "${imagePromptTemplate(style, 'detective scene, atmospheric')}",\n` +
    `    "puzzleObject": "${imagePromptTemplate(style, 'antique object, intricate detail')}"\n` +
    `  }\n` +
    `}\n\n` +
    `Hard rules (violations will break the game UI):\n` +
    `- All hex colors: exactly #rrggbb format, no comments or extra text\n` +
    `- colorPalette: 4-6 entries\n` +
    `- textureFamily: exactly one of paper|grain|cork|metal|leather|fabric|pixel_noise\n` +
    `- panelStyle: exactly one of flat|raised|inset\n` +
    `- secondary and surface must be in the same dark/light direction as primary (all dark OR all light)\n` +
    `- textColor contrast ≥4.5:1 against primary, secondary, AND surface — if unsure, use near-white (#f0ece0) for dark themes or near-black (#1a1a1a) for light themes\n` +
    `- accentColor contrast ≥4.5:1 against primary and secondary — accent can be saturated/colorful but must still be readable as text\n` +
    `- Prefer very high contrast for small typography: labels, metadata, helper text, and buttons should still look obviously readable when rendered around 12-14px\n` +
    `- Avoid low-contrast gold-on-beige, gray-on-gray, or washed-out monochrome palettes even if they are aesthetically on-theme\n` +
    `- Do NOT make accent and text the same color\n` +
    `- The palette must evoke "${styleReference(style)}" — avoid defaulting to generic dark navy/gold unless it specifically fits`
  );
}

// ── Safe image prompt rewrite ─────────────────────────────────────────────────

export function buildSafeImagePrompt(originalPrompt: string): string {
  return (
    `Rewrite this image-generation prompt into a safer production prompt before it is sent to the image worker.\n` +
    `ORIGINAL PROMPT: "${originalPrompt}"\n\n` +
    `Preserve the same scene, composition, atmosphere, visual style, and subject intent while making it less likely to trigger content filters.\n` +
    `- Replace specific character names with generic descriptors (e.g. "a middle-aged man" not "Victor LeBlanc")\n` +
    `- Remove all proper nouns entirely, including first names, surnames, city names, venue names, and unique location names\n` +
    `- Replace identifiable person names, branded references, and overly specific personal details with neutral descriptive terms\n` +
    `- The final prompt must contain zero proper nouns and zero quoted names\n` +
    `- Avoid wording that implies real-world violence, harm, or explicit content\n` +
    `- Prefer detective-fiction phrasing like "tense scene", "mysterious evidence", or "dramatic portrait" over explicit criminal acts\n` +
    `- Keep the same art style prefix, mood, atmosphere, and compositional intent intact\n` +
    `- Keep the prompt concise and image-model friendly\n` +
    `- If any specific name or unique place remains, rewrite it again into a generic description before answering\n` +
    `- Output ONLY the rewritten prompt text — no explanation, no quotes, no extra text`
  );
}
