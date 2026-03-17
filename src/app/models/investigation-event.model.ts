export interface UnlockCondition {
  type: 'event_completed' | 'clue_found' | 'act_reached';
  referenceId: string;
}

/** One clickable hotspot inside a searchable-room investigation event. */
export interface ExaminationSpot {
  id: string;
  label: string;
  /** Atmospheric description the player reads when they inspect this spot. */
  description: string;
  /** If set, examining this spot reveals the clue with this ID. */
  rewardsClueId?: string;
}

export interface InvestigationEvent {
  id: string;
  category: 'investigation' | 'social' | 'surprise' | 'puzzle' | 'deduction';
  type: string;
  title: string;
  description: string;
  act: 1 | 2 | 3;
  isMandatory: boolean;
  unlockConditions: UnlockCondition[];
  rewardsClueIds: string[];
  unlocksSuspectIds: string[];
  puzzleId?: string;
  dialogueSuspectId?: string;
  narration: string;
  /** Populated for category === 'investigation' events. */
  examinationSpots?: ExaminationSpot[];
}
