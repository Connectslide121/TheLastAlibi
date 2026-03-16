import { InvestigationEvent, UnlockCondition } from '../models';

/**
 * Detects and repairs silent deadlocks in an investigation event graph.
 *
 * A deadlock occurs when an event's unlockConditions reference:
 *  - another event that itself can never be reached (circular or dangling dependency), or
 *  - a clue that can never be found (because no reachable event rewards it).
 *
 * The repair iteratively strips the blocking conditions from unreachable events,
 * re-evaluates reachability, and repeats until the full graph is reachable.
 * `act_reached` conditions are always considered satisfiable (the player will advance acts).
 *
 * Returns a new array – events that needed no repair are returned by reference.
 */
export function repairEventGraph(events: InvestigationEvent[]): InvestigationEvent[] {
  let current = events;

  // At most one repair pass per event is needed for the graph to converge.
  for (let pass = 0; pass <= current.length; pass++) {
    const reachableIds = new Set<string>();
    const foundableClueIds = new Set<string>();

    const isSatisfied = (cond: UnlockCondition): boolean => {
      if (cond.type === 'event_completed') return reachableIds.has(cond.referenceId);
      if (cond.type === 'clue_found') return foundableClueIds.has(cond.referenceId);
      return true; // 'act_reached' is always eventually satisfiable
    };

    // Expand the reachable set to its fixed point.
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const ev of current) {
        if (reachableIds.has(ev.id)) continue;
        if (ev.unlockConditions.every(isSatisfied)) {
          reachableIds.add(ev.id);
          ev.rewardsClueIds.forEach((id) => foundableClueIds.add(id));
          expanded = true;
        }
      }
    }

    if (reachableIds.size === current.length) {
      // All events are reachable – no (further) repair needed.
      return current;
    }

    // Strip the specific conditions that are permanently unsatisfiable.
    let anyStripped = false;
    const next = current.map((ev) => {
      if (reachableIds.has(ev.id)) return ev;
      const safe = ev.unlockConditions.filter(isSatisfied);
      if (safe.length === ev.unlockConditions.length) return ev; // nothing blocked here
      anyStripped = true;
      return { ...ev, unlockConditions: safe };
    });

    if (!anyStripped) {
      // Conditions still block but nothing could be stripped (e.g. pure cycles where
      // no member has ANY satisfiable condition). Clear all conditions on blocked events
      // as a last resort so they become freely available from their act.
      return current.map((ev) => {
        if (reachableIds.has(ev.id)) return ev;
        console.warn(
          `[EventGraph] Force-clearing all unlock conditions on deadlocked event "${ev.id}".`,
        );
        return { ...ev, unlockConditions: [] };
      });
    }

    current = next;
  }

  return current;
}
