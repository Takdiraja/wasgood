export interface HSVRange {
  hMin: number;
  hMax: number;
  sMin: number;
  sMax: number;
  vMin: number;
  vMax: number;
}

export interface ColorSettings {
  green: HSVRange;
  yellow: HSVRange;
  blue: HSVRange;
}

export interface ROI {
  x: number; // percentage-based 0 to 100 for responsive scaling
  y: number;
  width: number;
  height: number;
}

export type ColorType = 'green' | 'yellow' | 'blue';

export interface DetectionResults {
  green: number;
  yellow: number;
  blue: number;
  total: number;
}

export type AppState = 'IDLE' | 'SEARCHING_BOARD' | 'COUNTING' | 'COOLDOWN' | 'QUESTION_DETECTED';

export interface PerformanceStats {
  fps: number;
  processingTime: number; // ms
}

export interface AppSettings {
  colors: ColorSettings;
  minArea: number;
  maxArea: number;
  aspectRatioTolerance: number; // e.g. 0.2 means 0.8 to 1.2
  autoAnswerEnabled: boolean;
  debugOverlayEnabled: boolean;
  gridDetectionSensitivity: number; // threshold for active tile counting
}
