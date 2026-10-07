import {
  CasePackage,
  Clue,
  ExaminationSpot,
  InvestigationEvent,
  Suspect,
  UnlockCondition,
} from '../models';

/**
 * Post-generation integrity pass. Runs at assembly and every time a case is
 * loaded, so it must be idempotent and must never drop content the player
 * could otherwise reach.
 *
 *  1. Canonicalize — dedupe IDs, snap misspelled references to the closest
 *     valid ID (or drop them), coerce acts to 1–3, fix contradictory event shapes.
 *  2. Structure — every suspect gets an interview, every act gets a mandatory event.
 *  3. Simulate + repair — play the case act by act the way the runtime gates it
 *     (acts, mandatory events, unlock conditions) and strip conditions that can't
 *     be met in time, re-home clues nobody can find, and surface suspects early
 *     enough to be accused.
 */
export function ensureCaseIntegrity(pkg: CasePackage): CasePackage {
  let out = canonicalize(pkg);
  out = ensureInterviewForEverySuspect(out);
  out = { ...out, eventGraph: repairUnreachableEvents(out.eventGraph) };
  out = rehomeOrphanClues(out);
  out = ensureSuspectsVisibleBeforeAccusation(out);
  out = ensureMandatoryEventPerAct(out);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// ID resolution
// ─────────────────────────────────────────────────────────────────────────────

const ACTS = [1, 2, 3] as const;
type Act = (typeof ACTS)[number];

const CATEGORIES: InvestigationEvent['category'][] = [
  'investigation',
  'social',
  'surprise',
  'puzzle',
  'deduction',
];

function slug(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/**
 * Builds a resolver that maps an LLM-written reference onto a real ID:
 * exact match → slug match (with or without the type prefix) → closest ID by
 * edit distance, if close enough. Returns null when nothing is plausible.
 */
export function makeIdResolver(validIds: string[], prefix: string) {
  const valid = new Set(validIds);
  const bySlug = new Map<string, string>();
  for (const id of validIds) {
    const s = slug(id);
    bySlug.set(s, id);
    bySlug.set(s.startsWith(`${prefix}-`) ? s.slice(prefix.length + 1) : `${prefix}-${s}`, id);
  }
  return (raw: unknown): string | null => {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    if (valid.has(raw)) return raw;
    const s = slug(raw);
    const hit = bySlug.get(s);
    if (hit) return hit;
    let best: string | null = null;
    let bestDist = Infinity;
    for (const id of validIds) {
      const d = levenshtein(s, slug(id));
      if (d < bestDist) {
        bestDist = d;
        best = id;
      }
    }
    return best && bestDist <= Math.max(2, Math.floor(s.length * 0.25)) ? best : null;
  };
}

function dedupeIds<T extends { id: string }>(items: T[], prefix: string): T[] {
  const seen = new Set<string>();
  return items.map((item, index) => {
    let id = typeof item.id === 'string' && item.id.trim() ? item.id : `${prefix}-${index + 1}`;
    if (seen.has(id)) {
      let n = 2;
      while (seen.has(`${id}-${n}`)) n++;
      console.warn(`[Integrity] Duplicate ${prefix} id "${id}" renamed to "${id}-${n}"`);
      id = `${id}-${n}`;
    }
    seen.add(id);
    return id === item.id ? item : { ...item, id };
  });
}

function unique(ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))];
}

function toAct(raw: unknown): Act {
  const n = Number(String(raw ?? '').match(/\d+/)?.[0]);
  return n >= 3 ? 3 : n === 2 ? 2 : 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Canonicalize
// ─────────────────────────────────────────────────────────────────────────────

function canonicalize(pkg: CasePackage): CasePackage {
  const suspects = dedupeIds(pkg.suspects ?? [], 'suspect');
  const locations = dedupeIds(pkg.locations ?? [], 'location');
  const clues0 = dedupeIds(pkg.clues ?? [], 'clue');
  const puzzles = pkg.puzzles ?? [];
  const rawEvents = dedupeIds(pkg.eventGraph ?? [], 'event');

  const suspectId = makeIdResolver(
    suspects.map((s) => s.id),
    'suspect',
  );
  const clueId = makeIdResolver(
    clues0.map((c) => c.id),
    'clue',
  );
  const locationId = makeIdResolver(
    locations.map((l) => l.id),
    'location',
  );
  const eventId = makeIdResolver(
    rawEvents.map((e) => e.id),
    'event',
  );
  const puzzleIds = new Set(puzzles.map((p) => p.id));

  // Clues: snap locationId to a real location so the clue shows up on the map.
  const clues: Clue[] = clues0.map((clue) => {
    const loc = locationId(clue.locationId) ?? locations[0]?.id ?? clue.locationId;
    return loc === clue.locationId ? clue : { ...clue, locationId: loc };
  });

  const locationsWithClues = locations.map((location) => ({
    ...location,
    cluesFoundHere: clues.filter((c) => c.locationId === location.id).map((c) => c.id),
  }));

  // Truth layer
  const t = pkg.truth;
  let culpritId = suspectId(t.culpritId);
  if (!culpritId) {
    const liars = suspects.filter((s) => s.isLying);
    culpritId = liars.length === 1 ? liars[0].id : null;
    console.warn(`[Integrity] culpritId "${t.culpritId}" matches no suspect → ${culpritId}`);
  }
  const revealingClueIds = unique((t.revealingClueIds ?? []).map(clueId));
  const truth = {
    ...t,
    culpritId: culpritId ?? t.culpritId,
    revealingClueIds,
    redHerringClueIds: unique((t.redHerringClueIds ?? []).map(clueId)),
    importantClueId: clueId(t.importantClueId) ?? revealingClueIds[0] ?? t.importantClueId,
    lyingSuspectIds: unique((t.lyingSuspectIds ?? []).map(suspectId)),
    mistakenSuspectIds: unique((t.mistakenSuspectIds ?? []).map(suspectId)),
    hidingSecretSuspectIds: unique((t.hidingSecretSuspectIds ?? []).map(suspectId)),
  };
  const fixedSuspects: Suspect[] = suspects.map((s) =>
    s.id === truth.culpritId && !s.isLying ? { ...s, isLying: true } : s,
  );

  const timeline = (pkg.timeline ?? []).map((entry) => ({
    ...entry,
    involvedSuspectIds: unique((entry.involvedSuspectIds ?? []).map(suspectId)),
  }));

  const fixedPuzzles = puzzles.map((p) => {
    const reward = clueId(p.rewardedClueId);
    return reward && reward !== p.rewardedClueId ? { ...p, rewardedClueId: reward } : p;
  });
  const puzzleRewardById = new Map(fixedPuzzles.map((p) => [p.id, clueId(p.rewardedClueId)]));

  const eventGraph: InvestigationEvent[] = rawEvents.map((raw) => {
    const ev: InvestigationEvent = {
      ...raw,
      category: CATEGORIES.includes(raw.category) ? raw.category : 'investigation',
      act: toAct(raw.act),
      isMandatory: raw.isMandatory === true || String(raw.isMandatory) === 'true',
      title: raw.title || 'Follow a lead',
      narration: raw.narration ?? raw.description ?? '',
      rewardsClueIds: unique((raw.rewardsClueIds ?? []).map(clueId)),
      unlocksSuspectIds: unique((raw.unlocksSuspectIds ?? []).map(suspectId)),
      dialogueSuspectId: suspectId(raw.dialogueSuspectId) ?? undefined,
      puzzleId: raw.puzzleId && puzzleIds.has(raw.puzzleId) ? raw.puzzleId : undefined,
      unlockConditions: canonicalizeConditions(raw.unlockConditions, raw.id, eventId, clueId),
    };

    // A puzzle event whose puzzle never got built plays as plain narration.
    if (ev.category === 'puzzle' && !ev.puzzleId) ev.category = 'deduction';
    if (ev.puzzleId) {
      ev.category = 'puzzle';
      const reward = puzzleRewardById.get(ev.puzzleId);
      if (reward && !ev.rewardsClueIds.includes(reward)) ev.rewardsClueIds.push(reward);
    }

    // The view opens an interview whenever dialogueSuspectId is set, which hides
    // examination spots and puzzles. Only social events may carry one.
    const spots = canonicalizeSpots(raw.examinationSpots, clueId);
    // Every spot reward must also be an event reward (coverage, replay, and the
    // interview fallback below all rely on it).
    for (const s of spots) {
      if (s.rewardsClueId && !ev.rewardsClueIds.includes(s.rewardsClueId)) {
        ev.rewardsClueIds.push(s.rewardsClueId);
      }
    }
    if (ev.dialogueSuspectId && ev.category !== 'social') {
      if (spots.length > 0 || ev.puzzleId) {
        ev.unlocksSuspectIds = unique([...ev.unlocksSuspectIds, ev.dialogueSuspectId]);
        ev.dialogueSuspectId = undefined;
      } else {
        ev.category = 'social';
      }
    }
    if (ev.category === 'social') {
      if (!ev.dialogueSuspectId) {
        ev.category = 'surprise';
      } else {
        ev.examinationSpots = undefined;
        return ev;
      }
    }

    ev.examinationSpots = spots.length > 0 ? spots : undefined;
    return ev;
  });

  return {
    ...pkg,
    truth,
    suspects: fixedSuspects,
    locations: locationsWithClues,
    clues,
    timeline,
    puzzles: fixedPuzzles,
    eventGraph,
  };
}

function canonicalizeConditions(
  raw: UnlockCondition[] | undefined,
  selfId: string,
  eventId: (id: unknown) => string | null,
  clueId: (id: unknown) => string | null,
): UnlockCondition[] {
  const out: UnlockCondition[] = [];
  for (const cond of raw ?? []) {
    if (!cond) continue;
    if (cond.type === 'event_completed') {
      const ref = eventId(cond.referenceId);
      if (ref && ref !== selfId) out.push({ type: 'event_completed', referenceId: ref });
    } else if (cond.type === 'clue_found') {
      const ref = clueId(cond.referenceId);
      if (ref) out.push({ type: 'clue_found', referenceId: ref });
    } else if (cond.type === 'act_reached') {
      const n = String(cond.referenceId ?? '').match(/[123]/)?.[0];
      if (n) out.push({ type: 'act_reached', referenceId: n });
    }
    // Anything else (unknown types, suspect references) can never resolve — drop it.
  }
  const seen = new Set<string>();
  return out.filter((c) => {
    const key = `${c.type}:${c.referenceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalizeSpots(
  raw: ExaminationSpot[] | null | undefined,
  clueId: (id: unknown) => string | null,
): ExaminationSpot[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .filter((s) => s && (s.label || s.description))
    .map((s, i) => {
      let id = s.id || `spot-${i + 1}`;
      while (seen.has(id)) id = `${id}-${i + 1}`;
      seen.add(id);
      const reward = s.rewardsClueId ? clueId(s.rewardsClueId) : null;
      const spot: ExaminationSpot = {
        id,
        label: s.label || 'Look closer',
        description: s.description || '',
      };
      if (reward) spot.rewardsClueId = reward;
      return spot;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Playthrough simulation
// ─────────────────────────────────────────────────────────────────────────────

export interface Playthrough {
  /** Act in which each event first becomes playable (absent = never). */
  eventAct: Map<string, Act>;
  clueAct: Map<string, Act>;
  suspectAct: Map<string, Act>;
}

/**
 * Plays the case the way the runtime gates it: within each act the player
 * completes everything available (events from the current or earlier acts
 * whose conditions are met), then the act advances. Interviews always
 * complete on close and puzzles can always be revealed, so every playable
 * event yields all its rewards.
 */
export function simulatePlaythrough(events: InvestigationEvent[]): Playthrough {
  const eventAct = new Map<string, Act>();
  const clueAct = new Map<string, Act>();
  const suspectAct = new Map<string, Act>();

  for (const act of ACTS) {
    const satisfied = (c: UnlockCondition): boolean =>
      c.type === 'event_completed'
        ? eventAct.has(c.referenceId)
        : c.type === 'clue_found'
          ? clueAct.has(c.referenceId)
          : act >= Number(c.referenceId);

    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const ev of events) {
        if (eventAct.has(ev.id) || ev.act > act) continue;
        if (!ev.unlockConditions.every(satisfied)) continue;
        eventAct.set(ev.id, act);
        for (const id of ev.rewardsClueIds) if (!clueAct.has(id)) clueAct.set(id, act);
        const met = [...ev.unlocksSuspectIds, ev.dialogueSuspectId].filter(Boolean) as string[];
        for (const id of met) if (!suspectAct.has(id)) suspectAct.set(id, act);
        progressed = true;
      }
    }
  }
  return { eventAct, clueAct, suspectAct };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2/3. Structure + repair
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips unlock conditions that keep an event from being playable in time:
 * a mandatory event must be playable in its own act (otherwise the act never
 * closes), and every event must be playable at some point. Each pass removes
 * at least one condition, so this terminates.
 */
function repairUnreachableEvents(events: InvestigationEvent[]): InvestigationEvent[] {
  let current = events;
  for (let pass = 0; pass < 50; pass++) {
    const sim = simulatePlaythrough(current);
    const isLate = (ev: InvestigationEvent): boolean => {
      const reached = sim.eventAct.get(ev.id);
      return reached === undefined || (ev.isMandatory && reached > ev.act);
    };
    if (!current.some(isLate)) return current;

    // A condition is "in time" if its reference is obtained by the end of the event's act.
    const inTime = (c: UnlockCondition, act: Act): boolean => {
      const at =
        c.type === 'event_completed'
          ? sim.eventAct.get(c.referenceId)
          : c.type === 'clue_found'
            ? sim.clueAct.get(c.referenceId)
            : (Number(c.referenceId) as Act);
      return at !== undefined && at <= act;
    };

    let stripped = false;
    current = current.map((ev) => {
      if (!isLate(ev)) return ev;
      const keep = ev.unlockConditions.filter((c) => inTime(c, ev.act));
      const next = keep.length === ev.unlockConditions.length ? [] : keep;
      if (next.length === ev.unlockConditions.length) return ev;
      stripped = true;
      console.warn(`[Integrity] Relaxed unlock conditions on "${ev.id}" (act ${ev.act})`);
      return { ...ev, unlockConditions: next };
    });
    if (!stripped) return current;
  }
  return current;
}

/** Suspects with no interview get one, in the act they are first met (or act 1). */
function ensureInterviewForEverySuspect(pkg: CasePackage): CasePackage {
  const sim = simulatePlaythrough(pkg.eventGraph);
  const interviewed = new Set(
    pkg.eventGraph.filter((e) => e.category === 'social').map((e) => e.dialogueSuspectId),
  );
  const extra: InvestigationEvent[] = [];
  for (const suspect of pkg.suspects) {
    if (interviewed.has(suspect.id)) continue;
    const act = Math.min(sim.suspectAct.get(suspect.id) ?? 1, 2) as Act;
    extra.push({
      id: `event-interview-${slug(suspect.id)}`,
      category: 'social',
      type: 'interview',
      title: `Question ${suspect.name}`,
      description: `${suspect.name} (${suspect.occupation}) has agreed to answer a few questions.`,
      act,
      isMandatory: false,
      unlockConditions: [],
      rewardsClueIds: [],
      unlocksSuspectIds: [suspect.id],
      dialogueSuspectId: suspect.id,
      narration: suspect.description,
    });
    console.warn(`[Integrity] Added interview for "${suspect.id}" in act ${act}`);
  }
  return extra.length ? { ...pkg, eventGraph: [...pkg.eventGraph, ...extra] } : pkg;
}

/**
 * Clues no playable event awards get a spot in a "Revisit <location>" scene,
 * one per (location, act). Culprit clues land in act 2 so the case stays
 * solvable before the accusation opens; everything else spreads over acts 1–2.
 */
function rehomeOrphanClues(pkg: CasePackage): CasePackage {
  const sim = simulatePlaythrough(pkg.eventGraph);
  const orphans = pkg.clues.filter((c) => !sim.clueAct.has(c.id));
  if (orphans.length === 0) return pkg;

  const culpritClues = new Set(pkg.truth.revealingClueIds);
  const events = pkg.eventGraph.map((e) => ({ ...e }));
  orphans.forEach((clue, i) => {
    const act: Act = culpritClues.has(clue.id) ? 2 : clue.isRedHerring ? 1 : i % 2 === 0 ? 1 : 2;
    const location = pkg.locations.find((l) => l.id === clue.locationId) ?? pkg.locations[0];
    const id = `event-revisit-${slug(location?.id ?? 'scene')}-act${act}`;
    let target = events.find((e) => e.id === id);
    if (!target) {
      target = {
        id,
        category: 'investigation',
        type: 'searchRoom',
        title: location ? `Revisit: ${location.name}` : 'Go over the scene again',
        description: 'Something here was overlooked the first time.',
        act,
        isMandatory: false,
        unlockConditions: [],
        rewardsClueIds: [],
        unlocksSuspectIds: [],
        narration: location ? `${location.description} ${location.atmosphere ?? ''}`.trim() : '',
        examinationSpots: [
          {
            id: 'spot-take-in-the-scene',
            label: 'Take in the scene',
            description: location?.atmosphere || 'Nothing else stands out at first glance.',
          },
        ],
      };
      events.push(target);
    }
    target.rewardsClueIds = [...target.rewardsClueIds, clue.id];
    target.examinationSpots = [
      ...(target.examinationSpots ?? []),
      {
        id: `spot-${slug(clue.id)}`,
        label: SPOT_LABELS[target.examinationSpots?.length ?? 0] ?? 'Look closer',
        description: clue.description,
        rewardsClueId: clue.id,
      },
    ];
    console.warn(`[Integrity] Re-homed orphan clue "${clue.id}" → "${id}"`);
  });
  return { ...pkg, eventGraph: events };
}

const SPOT_LABELS = [
  'Take in the scene',
  'A detail you missed',
  'Under closer scrutiny',
  'Something out of place',
  'Behind the obvious',
  'A second look',
];

/**
 * The accusation opens as soon as act 3 begins and only lists suspects the
 * player has met, so everyone — above all the culprit — must be met by act 2.
 */
function ensureSuspectsVisibleBeforeAccusation(pkg: CasePackage): CasePackage {
  const sim = simulatePlaythrough(pkg.eventGraph);
  const late = pkg.suspects.filter((s) => (sim.suspectAct.get(s.id) ?? 3) > 2).map((s) => s.id);
  if (late.length === 0) return pkg;

  const events = pkg.eventGraph.map((e) => ({ ...e }));
  const host =
    events.find((e) => e.act === 2 && e.isMandatory && sim.eventAct.get(e.id) === 2) ??
    events.find((e) => e.act === 1 && e.isMandatory) ??
    events.find((e) => e.act <= 2 && sim.eventAct.has(e.id));
  if (!host) return pkg;
  host.unlocksSuspectIds = unique([...host.unlocksSuspectIds, ...late]);
  console.warn(`[Integrity] Suspects ${late.join(', ')} now unlocked by "${host.id}"`);
  return { ...pkg, eventGraph: events };
}

/**
 * Acts only advance when their mandatory events are done; an act without any
 * gets one (prefer an investigation scene, which always yields evidence).
 */
function ensureMandatoryEventPerAct(pkg: CasePackage): CasePackage {
  const sim = simulatePlaythrough(pkg.eventGraph);
  const events = pkg.eventGraph.map((e) => ({ ...e }));
  for (const act of ACTS) {
    const inAct = events.filter((e) => e.act === act);
    if (inAct.length === 0 || inAct.some((e) => e.isMandatory)) continue;
    const pick =
      inAct.find((e) => e.category === 'investigation' && sim.eventAct.get(e.id) === act) ??
      inAct.find((e) => sim.eventAct.get(e.id) === act);
    if (pick) {
      pick.isMandatory = true;
      console.warn(`[Integrity] Made "${pick.id}" mandatory so act ${act} can close`);
    }
  }
  return { ...pkg, eventGraph: events };
}
