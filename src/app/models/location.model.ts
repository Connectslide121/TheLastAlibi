export interface Location {
  id: string;
  name: string;
  description: string;
  atmosphere: string;
  cluesFoundHere: string[];
  imagePrompt: string;
  imageUrl?: string;
}
