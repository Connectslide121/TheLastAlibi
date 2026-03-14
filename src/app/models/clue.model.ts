export interface Clue {
  id: string;
  name: string;
  description: string;
  locationId: string;
  isRedHerring: boolean;
  revealsInfo: string;
  imagePrompt: string;
  imageUrl?: string;
}
