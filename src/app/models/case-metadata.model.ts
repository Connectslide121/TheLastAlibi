export interface CaseMetadata {
  title: string;
  subtitle: string;
  caseType: 'murder' | 'theft' | 'disappearance' | 'sabotage' | 'other';
  difficulty: 'easy' | 'normal' | 'hard' | 'genius';
  setting: string;
  briefing: string;
  act1Summary: string;
  act2Summary: string;
  act3Summary: string;
}
