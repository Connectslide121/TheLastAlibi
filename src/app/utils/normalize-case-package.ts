import { CasePackage } from '../models';
import { ensureCaseIntegrity } from './case-integrity';

export function normalizeCasePackage(casePackage: CasePackage): CasePackage {
  const validClueIds = new Set(casePackage.clues.map((clue) => clue.id));
  const eventGraph = casePackage.eventGraph.map((event) => ({
    ...event,
    unlockConditions: event.unlockConditions ?? [],
    rewardsClueIds: event.rewardsClueIds ?? [],
    unlocksSuspectIds: event.unlocksSuspectIds ?? [],
  }));
  const puzzleEventById = new Map(
    eventGraph.filter((event) => !!event.puzzleId).map((event) => [event.puzzleId!, event]),
  );

  const puzzles = casePackage.puzzles.map((puzzle) => {
    const eventRewardId = puzzleEventById
      .get(puzzle.id)
      ?.rewardsClueIds.find((clueId) => validClueIds.has(clueId));
    const rewardClueId = validClueIds.has(puzzle.rewardedClueId)
      ? puzzle.rewardedClueId
      : (eventRewardId ?? puzzle.rewardedClueId);
    const title =
      puzzle.title ||
      (puzzle.htmlComponent.match(/<title>([^<]+)<\/title>/i)?.[1] ?? 'Puzzle Exhibit');
    const description =
      puzzle.description ||
      puzzle.solutionCondition ||
      'Examine the puzzle exhibit and submit the answer from the case file.';

    return {
      ...puzzle,
      title,
      description,
      interactionInstructions: puzzle.interactionInstructions ?? description,
      visibleClues: puzzle.visibleClues ?? [],
      answerPrompt: puzzle.answerPrompt ?? 'Submit your answer',
      answerPlaceholder: puzzle.answerPlaceholder ?? 'Enter the answer exactly as the clues imply',
      answerFormat: puzzle.answerFormat ?? puzzle.solutionCondition,
      acceptableAnswers: puzzle.acceptableAnswers ?? [puzzle.solutionCondition].filter(Boolean),
      validationLogic:
        puzzle.validationLogic ??
        'Match the intended solution exactly or to an accepted alternate answer.',
      uiConcept: puzzle.uiConcept ?? 'Single-panel puzzle exhibit',
      hints: puzzle.hints ?? [],
      rewardedClueId: rewardClueId,
    };
  });

  // Canonicalize IDs, then simulate a playthrough and repair anything the
  // player could never reach (see case-integrity.ts).
  return ensureCaseIntegrity({
    ...casePackage,
    puzzles,
    eventGraph,
  });
}
