import { DialogueLine } from './dialogue-hint.model';

export interface Suspect {
  id: string;
  name: string;
  age: number;
  occupation: string;
  relationship: string;
  description: string;
  personality: string;
  alibi: string;
  secretUnrelatedToCase: string;
  isLying: boolean;
  isMistaken: boolean;
  isHidingSecret: boolean;
  interviewDialogue: DialogueLine[];
  imagePrompt: string;
  imageUrl?: string;
}
