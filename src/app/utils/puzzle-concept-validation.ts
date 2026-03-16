import { Clue } from '../models';
import { PuzzleConcept } from '../services/llm-generation.types';

export interface PuzzleConceptValidationResult {
  isValid: boolean;
  reasons: string[];
}

const STOP_WORDS = new Set([
  'about',
  'after',
  'before',
  'clue',
  'digit',
  'entry',
  'first',
  'found',
  'from',
  'hidden',
  'into',
  'just',
  'look',
  'next',
  'number',
  'pattern',
  'plain',
  'solve',
  'their',
  'there',
  'these',
  'this',
  'time',
  'timestamps',
  'using',
  'value',
  'with',
]);

const VAGUE_PATTERNS = [
  /hidden in plain sight/i,
  /look for a pattern/i,
  /use the clues/i,
  /calculate the .*key/i,
  /the answer should be obvious/i,
  /notice the pattern/i,
];

const OPERATION_HINTS =
  /(take|combine|concatenate|sum|add|subtract|difference|order|sort|reverse|extract|use the first|use the last|map|convert|count|pair|minutes|seconds|hours|digit)/i;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s:]/g, ' ');
}

function extractClueKeywords(clues: string[], sourceClues: Clue[]): string[] {
  const text = [
    ...clues,
    ...sourceClues.map((clue) => `${clue.name} ${clue.description} ${clue.revealsInfo}`),
  ]
    .join(' ')
    .toLowerCase();

  const numberTokens = Array.from(new Set(text.match(/\b\d{1,5}(?::\d{2}){0,2}\b/g) ?? []));
  const wordTokens = Array.from(
    new Set(
      (text.match(/\b[a-z][a-z0-9'-]{3,}\b/g) ?? []).filter((token) => !STOP_WORDS.has(token)),
    ),
  );

  return [...numberTokens, ...wordTokens].slice(0, 60);
}

export function validatePuzzleConcept(
  concept: PuzzleConcept,
  sourceClues: Clue[],
  expectedRewardedClueId: string,
): PuzzleConceptValidationResult {
  const reasons: string[] = [];

  if (!concept.puzzleTitle?.trim()) reasons.push('Missing puzzleTitle.');
  if (!concept.puzzleDescription?.trim()) reasons.push('Missing puzzleDescription.');
  if (!concept.puzzleLogic?.trim()) reasons.push('Missing puzzleLogic.');
  if (!concept.interactionInstructions?.trim()) reasons.push('Missing interactionInstructions.');
  if (!concept.solution?.trim()) reasons.push('Missing solution.');

  if (concept.rewardedClueId !== expectedRewardedClueId) {
    reasons.push(`rewardedClueId must be exactly ${expectedRewardedClueId}.`);
  }

  if (concept.clues.length < 2 || concept.clues.length > 5) {
    reasons.push('clues must contain 2-5 visible, concrete clues.');
  }

  if (concept.derivationSteps.length < 2 || concept.derivationSteps.length > 6) {
    reasons.push('derivationSteps must contain 2-6 explicit solving steps.');
  }

  if (concept.hints.length < 3 || concept.hints.length > 5) {
    reasons.push('hints must contain 3-5 entries.');
  }

  const normalizedAnswers = new Set(
    concept.acceptableAnswers
      .map((answer) => normalizeText(answer).replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  );
  const normalizedSolution = normalizeText(concept.solution).replace(/\s+/g, ' ').trim();
  if (!normalizedAnswers.has(normalizedSolution)) {
    reasons.push('acceptableAnswers must include the canonical solution.');
  }

  const clueKeywords = extractClueKeywords(concept.clues, sourceClues);
  const derivationText = concept.derivationSteps.join(' ').toLowerCase();
  const clueMatches = clueKeywords.filter((keyword) =>
    derivationText.includes(keyword.toLowerCase()),
  );

  if (clueMatches.length < 2) {
    reasons.push('derivationSteps do not clearly reference concrete visible clue content.');
  }

  const hasNumericSolution = /^\s*\d[\d\s-]*\s*$/.test(concept.solution);
  if (hasNumericSolution && !OPERATION_HINTS.test(derivationText)) {
    reasons.push('Numeric solutions must explain how digits are derived, ordered, or combined.');
  }

  const vagueStepCount = concept.derivationSteps.filter((step) =>
    VAGUE_PATTERNS.some((pattern) => pattern.test(step)),
  ).length;
  if (vagueStepCount > 0 && clueMatches.length < 3) {
    reasons.push(
      'derivationSteps are too vague and read like hints instead of an actual derivation.',
    );
  }

  const vagueLogic = VAGUE_PATTERNS.some((pattern) => pattern.test(concept.puzzleLogic));
  if (vagueLogic && !OPERATION_HINTS.test(concept.puzzleLogic)) {
    reasons.push('puzzleLogic is too vague and does not explain the actual solving rule.');
  }

  return {
    isValid: reasons.length === 0,
    reasons,
  };
}
