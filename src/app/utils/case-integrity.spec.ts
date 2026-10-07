import { describe, expect, it } from 'vitest';
import { CasePackage, InvestigationEvent, Suspect } from '../models';
import { ensureCaseIntegrity, makeIdResolver, simulatePlaythrough } from './case-integrity';

function suspect(id: string, extra: Partial<Suspect> = {}): Suspect {
  return {
    id,
    name: id.replace('suspect-', ''),
    age: 40,
    occupation: 'job',
    relationship: 'rel',
    description: 'desc',
    personality: 'calm',
    alibi: 'home',
    secretUnrelatedToCase: '',
    isLying: false,
    isMistaken: false,
    isHidingSecret: false,
    interviewDialogue: [],
    imagePrompt: '',
    ...extra,
  };
}

function event(id: string, extra: Partial<InvestigationEvent> = {}): InvestigationEvent {
  return {
    id,
    category: 'investigation',
    type: 'searchRoom',
    title: id,
    description: '',
    act: 1,
    isMandatory: false,
    unlockConditions: [],
    rewardsClueIds: [],
    unlocksSuspectIds: [],
    narration: '',
    ...extra,
  };
}

function makeCase(events: InvestigationEvent[], extra: Partial<CasePackage> = {}): CasePackage {
  const suspects = [
    suspect('suspect-ada', { isLying: true }),
    suspect('suspect-bo'),
    suspect('suspect-cy'),
  ];
  return {
    id: 'case-test',
    metadata: {} as CasePackage['metadata'],
    truth: {
      culpritId: 'suspect-ada',
      motive: '',
      method: '',
      trueTimeline: '',
      keyContradiction: '',
      importantClueId: 'clue-knife',
      redHerringExplanation: '',
      lyingSuspectIds: ['suspect-ada'],
      mistakenSuspectIds: [],
      hidingSecretSuspectIds: [],
      revealingClueIds: ['clue-knife', 'clue-ticket'],
      redHerringClueIds: ['clue-glove'],
    },
    suspects,
    locations: [
      {
        id: 'location-study',
        name: 'Study',
        description: 'A study.',
        atmosphere: 'Dusty.',
        cluesFoundHere: [],
        imagePrompt: '',
      },
    ],
    clues: ['clue-knife', 'clue-ticket', 'clue-glove'].map((id) => ({
      id,
      name: id,
      description: `${id} description`,
      locationId: 'location-study',
      isRedHerring: id === 'clue-glove',
      revealsInfo: '',
      imagePrompt: '',
    })),
    timeline: [],
    eventGraph: events,
    puzzles: [],
    hintLadder: [],
    solutionExplanation: {} as CasePackage['solutionExplanation'],
    visualDirection: {} as CasePackage['visualDirection'],
    uiTheme: {} as CasePackage['uiTheme'],
    imagePromptTemplates: {} as CasePackage['imagePromptTemplates'],
    generatedAt: '',
    ...extra,
  };
}

/** A well-formed graph: one interview per suspect, every clue awarded, a mandatory per act. */
function healthyEvents(): InvestigationEvent[] {
  return [
    event('event-search', {
      isMandatory: true,
      rewardsClueIds: ['clue-glove'],
      examinationSpots: [
        { id: 'spot-a', label: 'A', description: 'a', rewardsClueId: 'clue-glove' },
        { id: 'spot-b', label: 'B', description: 'b' },
      ],
    }),
    event('event-talk-ada', { category: 'social', dialogueSuspectId: 'suspect-ada' }),
    event('event-talk-bo', { category: 'social', dialogueSuspectId: 'suspect-bo' }),
    event('event-talk-cy', { category: 'social', act: 2, dialogueSuspectId: 'suspect-cy' }),
    event('event-act2', { act: 2, isMandatory: true, rewardsClueIds: ['clue-knife'] }),
    event('event-act3', { act: 3, isMandatory: true, rewardsClueIds: ['clue-ticket'] }),
  ];
}

function reachableEverything(pkg: CasePackage) {
  const sim = simulatePlaythrough(pkg.eventGraph);
  return {
    sim,
    allClues: pkg.clues.every((c) => sim.clueAct.has(c.id)),
    allSuspects: pkg.suspects.every((s) => sim.suspectAct.has(s.id)),
    allEvents: pkg.eventGraph.every((e) => sim.eventAct.has(e.id)),
  };
}

describe('makeIdResolver', () => {
  const resolve = makeIdResolver(['clue-bloody-knife', 'clue-train-ticket'], 'clue');

  it('matches exact, missing-prefix, case and small typos', () => {
    expect(resolve('clue-bloody-knife')).toBe('clue-bloody-knife');
    expect(resolve('bloody-knife')).toBe('clue-bloody-knife');
    expect(resolve('Clue Bloody Knife')).toBe('clue-bloody-knife');
    expect(resolve('clue-bloddy-knife')).toBe('clue-bloody-knife');
  });

  it('rejects references that resemble nothing', () => {
    expect(resolve('clue-pocket-watch')).toBeNull();
    expect(resolve('')).toBeNull();
    expect(resolve(undefined)).toBeNull();
  });
});

describe('ensureCaseIntegrity', () => {
  it('leaves a healthy case structurally unchanged', () => {
    const pkg = ensureCaseIntegrity(makeCase(healthyEvents()));
    expect(pkg.eventGraph.map((e) => e.id)).toEqual(healthyEvents().map((e) => e.id));
    expect(reachableEverything(pkg)).toMatchObject({
      allClues: true,
      allSuspects: true,
      allEvents: true,
    });
  });

  it('is idempotent (it runs again on every load)', () => {
    const broken = makeCase([event('event-only', { act: 2 })]);
    const once = ensureCaseIntegrity(broken);
    const twice = ensureCaseIntegrity(once);
    expect(twice.eventGraph).toEqual(once.eventGraph);
  });

  it('gives an act with no mandatory event one', () => {
    const events = healthyEvents().map((e) =>
      e.id === 'event-search' ? { ...e, isMandatory: false } : e,
    );
    const pkg = ensureCaseIntegrity(makeCase(events));
    expect(pkg.eventGraph.some((e) => e.act === 1 && e.isMandatory)).toBe(true);
  });

  it('strips a mandatory act-1 dependency on a later-act event', () => {
    const events = healthyEvents().map((e) =>
      e.id === 'event-search'
        ? {
            ...e,
            unlockConditions: [{ type: 'event_completed' as const, referenceId: 'event-act2' }],
          }
        : e,
    );
    const pkg = ensureCaseIntegrity(makeCase(events));
    const search = pkg.eventGraph.find((e) => e.id === 'event-search')!;
    expect(search.unlockConditions).toEqual([]);
    expect(reachableEverything(pkg).sim.eventAct.get('event-search')).toBe(1);
  });

  it('breaks unlock cycles', () => {
    const events = [
      ...healthyEvents(),
      event('event-x', {
        act: 2,
        unlockConditions: [{ type: 'event_completed', referenceId: 'event-y' }],
      }),
      event('event-y', {
        act: 2,
        unlockConditions: [{ type: 'event_completed', referenceId: 'event-x' }],
      }),
    ];
    expect(reachableEverything(ensureCaseIntegrity(makeCase(events))).allEvents).toBe(true);
  });

  it('canonicalizes act_reached, act numbers and misspelled IDs', () => {
    const events = healthyEvents().map((e) =>
      e.id === 'event-act2'
        ? {
            ...e,
            act: '2' as unknown as 2,
            rewardsClueIds: ['knife'],
            unlockConditions: [
              { type: 'act_reached' as const, referenceId: 'act-2' },
              { type: 'clue_found' as const, referenceId: 'clue-glov' },
            ],
          }
        : e,
    );
    const pkg = ensureCaseIntegrity(makeCase(events));
    const ev = pkg.eventGraph.find((e) => e.id === 'event-act2')!;
    expect(ev.act).toBe(2);
    expect(ev.rewardsClueIds).toEqual(['clue-knife']);
    expect(ev.unlockConditions).toEqual([
      { type: 'act_reached', referenceId: '2' },
      { type: 'clue_found', referenceId: 'clue-glove' },
    ]);
  });

  it('renames duplicate event IDs instead of letting one hide the other', () => {
    const events = [...healthyEvents(), event('event-search', { act: 2, rewardsClueIds: [] })];
    const ids = ensureCaseIntegrity(makeCase(events)).eventGraph.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('event-search-2');
  });

  it('re-homes orphan clues into a revisit scene with spots, never an interview', () => {
    const events = healthyEvents().map((e) =>
      e.id === 'event-act2' ? { ...e, rewardsClueIds: [] } : e,
    );
    const pkg = ensureCaseIntegrity(makeCase(events));
    const host = pkg.eventGraph.find((e) => e.rewardsClueIds.includes('clue-knife'))!;
    expect(host.category).toBe('investigation');
    expect(host.act).toBe(2); // culprit clue → before the accusation opens
    expect(host.examinationSpots?.some((s) => s.rewardsClueId === 'clue-knife')).toBe(true);
  });

  it('adds an interview for a suspect who has none', () => {
    const events = healthyEvents().filter((e) => e.id !== 'event-talk-bo');
    const pkg = ensureCaseIntegrity(makeCase(events));
    const talk = pkg.eventGraph.find((e) => e.dialogueSuspectId === 'suspect-bo')!;
    expect(talk.category).toBe('social');
  });

  it('keeps spots on a non-social event that also names a suspect', () => {
    const events = healthyEvents().map((e) =>
      e.id === 'event-search' ? { ...e, dialogueSuspectId: 'suspect-cy' } : e,
    );
    const ev = ensureCaseIntegrity(makeCase(events)).eventGraph.find(
      (e) => e.id === 'event-search',
    )!;
    expect(ev.dialogueSuspectId).toBeUndefined();
    expect(ev.unlocksSuspectIds).toContain('suspect-cy');
    expect(ev.examinationSpots?.length).toBe(2);
  });

  it('makes every suspect visible before act 3 opens the accusation', () => {
    const events = healthyEvents().map((e) =>
      e.id === 'event-talk-ada' ? { ...e, act: 3 as const } : e,
    );
    const { sim } = reachableEverything(ensureCaseIntegrity(makeCase(events)));
    expect(sim.suspectAct.get('suspect-ada')).toBeLessThanOrEqual(2);
  });

  it('snaps a culprit ID that matches no suspect', () => {
    const pkg = makeCase(healthyEvents());
    pkg.truth = { ...pkg.truth, culpritId: 'suspect-adaa' };
    expect(ensureCaseIntegrity(pkg).truth.culpritId).toBe('suspect-ada');
  });

  it('repairs a badly broken graph so everything is reachable', () => {
    const events: InvestigationEvent[] = [
      event('event-a', {
        isMandatory: true,
        unlockConditions: [{ type: 'clue_found', referenceId: 'clue-ticket' }],
      }),
      event('event-b', {
        act: 2,
        isMandatory: true,
        unlockConditions: [{ type: 'event_completed', referenceId: 'event-nonexistent-zzz' }],
        rewardsClueIds: ['clue-ticket'],
      }),
      event('event-c', { act: 3, category: 'social' }),
    ];
    const pkg = ensureCaseIntegrity(makeCase(events));
    expect(reachableEverything(pkg)).toMatchObject({
      allClues: true,
      allSuspects: true,
      allEvents: true,
    });
    for (const ev of pkg.eventGraph.filter((e) => e.isMandatory)) {
      expect(simulatePlaythrough(pkg.eventGraph).eventAct.get(ev.id)).toBe(ev.act);
    }
  });
});
