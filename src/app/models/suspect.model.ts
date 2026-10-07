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
  /** Ground truth: where they really were and what they really did (absent on older cases). */
  trueWhereabouts?: string;
  /** What this suspect lies about and why — their own lie, not the culprit's tell. */
  lieAbout?: string;
  /** What this suspect honestly misremembers. */
  mistakenBelief?: string;
  /** Things this suspect genuinely saw or knows that bear on the case. */
  knownFacts?: string[];
  interviewDialogue: DialogueLine[];
  imagePrompt: string;
  imageUrl?: string;
}
