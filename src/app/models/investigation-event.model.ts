export interface UnlockCondition {
  type: 'event_completed' | 'clue_found' | 'act_reached';
  referenceId: string;
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
}
