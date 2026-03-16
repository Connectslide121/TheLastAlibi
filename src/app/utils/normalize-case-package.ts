import { CasePackage, InvestigationEvent } from '../models';

/**
 * Ensures every suspect and every clue in the case is reachable through the
 * event graph. Orphaned items are assigned to existing non-puzzle events,
 * spread across acts so the player still experiences progression.
 */
function ensureCompleteCoverage(
  eventGraph: InvestigationEvent[],
  pkg: CasePackage,
): InvestigationEvent[] {
  const allSuspectIds = new Set(pkg.suspects.map((s) => s.id));
  const allClueIds = new Set(pkg.clues.map((c) => c.id));

  // Suspects reachable through unlocksSuspectIds or dialogueSuspectId
  const coveredSuspects = new Set<string>();
  for (const ev of eventGraph) {
    (ev.unlocksSuspectIds ?? []).forEach((id) => coveredSuspects.add(id));
    if (ev.dialogueSuspectId) coveredSuspects.add(ev.dialogueSuspectId);
  }

  // Clues reachable through rewardsClueIds
  const coveredClues = new Set<string>();
  for (const ev of eventGraph) {
    (ev.rewardsClueIds ?? []).forEach((id) => coveredClues.add(id));
  }

  const orphanSuspects = [...allSuspectIds].filter((id) => !coveredSuspects.has(id));
  const orphanClues = [...allClueIds].filter((id) => !coveredClues.has(id));

  if (orphanSuspects.length === 0 && orphanClues.length === 0) return eventGraph;

  // Clone events so we can mutate safely
  const events = eventGraph.map((ev) => ({
    ...ev,
    unlocksSuspectIds: [...(ev.unlocksSuspectIds ?? [])],
    rewardsClueIds: [...(ev.rewardsClueIds ?? [])],
  }));

  // Eligible targets: non-puzzle events, sorted by act ascending then by
  // current payload size ascending (round-robin load-balance across acts).
  const eligible = events
    .filter((ev) => !ev.puzzleId)
    .sort((a, b) => a.act - b.act || a.rewardsClueIds.length - b.rewardsClueIds.length);

  // Fallback: if every event is a puzzle event (very unlikely), use all events.
  const pool = eligible.length > 0 ? eligible : events;

  // Assign orphaned suspects – spread across the pool round-robin
  for (let i = 0; i < orphanSuspects.length; i++) {
    const target = pool[i % pool.length];
    target.unlocksSuspectIds.push(orphanSuspects[i]);
    console.warn(
      `[Coverage] Assigned orphan suspect "${orphanSuspects[i]}" → event "${target.id}" (act ${target.act})`,
    );
  }

  // Assign orphaned clues – spread across the pool round-robin
  for (let i = 0; i < orphanClues.length; i++) {
    const target = pool[i % pool.length];
    target.rewardsClueIds.push(orphanClues[i]);
    console.warn(
      `[Coverage] Assigned orphan clue "${orphanClues[i]}" → event "${target.id}" (act ${target.act})`,
    );
  }

  return events;
}

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

  const rewardByPuzzleId = new Map(
    puzzles
      .filter((puzzle) => validClueIds.has(puzzle.rewardedClueId))
      .map((puzzle) => [puzzle.id, puzzle.rewardedClueId]),
  );

  const normalizedEventGraph = eventGraph.map((event) => {
    if (!event.puzzleId) return event;

    const rewardClueId = rewardByPuzzleId.get(event.puzzleId);
    if (!rewardClueId) return event;
    if (event.rewardsClueIds.length === 1 && event.rewardsClueIds[0] === rewardClueId) {
      return event;
    }

    return {
      ...event,
      rewardsClueIds: [rewardClueId],
    };
  });

  // Ensure every suspect and clue is reachable through the event graph
  const coveredEventGraph = ensureCompleteCoverage(normalizedEventGraph, {
    ...casePackage,
    puzzles,
    eventGraph: normalizedEventGraph,
  });

  return {
    ...casePackage,
    puzzles,
    eventGraph: coveredEventGraph,
  };
}
