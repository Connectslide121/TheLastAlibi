export interface UITheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  surfaceColor: string;
  textColor: string;
  panelStyle: 'flat' | 'raised' | 'inset';
  borderStyle: string;
  shadowStyle: string;
  textureFamily:
    | 'paper'
    | 'grain'
    | 'cork'
    | 'metal'
    | 'leather'
    | 'fabric'
    | 'pixel_noise';
}
