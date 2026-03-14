export interface TimelineEvent {
  id: string;
  time: string;
  description: string;
  involvedSuspectIds: string[];
  isTrue: boolean;
}
