import type { AppSettings, ColorType, DetectionResults, ROI } from '../types';


export interface OverlayInfo {
  type: ColorType;
  rect: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface FrameProcessingResult {
  counts: DetectionResults;
  detectedQuestion: ColorType | null;
  overlays: OverlayInfo[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  colors: {
    green: {
      hMin: 45,
      hMax: 85,
      sMin: 110,
      sMax: 255,
      vMin: 45,
      vMax: 255,
    },
    yellow: {
      hMin: 15,
      hMax: 42,
      sMin: 90,
      sMax: 255,
      vMin: 60,
      vMax: 255,
    },
    blue: {
      hMin: 88,
      hMax: 130,
      sMin: 65,
      sMax: 255,
      vMin: 45,
      vMax: 255,
    },
  },
  minArea: 30, // minimum pixel area for a tile (lowered to catch small tiles at distance/zoom)
  maxArea: 15000, // maximum pixel area for a tile
  aspectRatioTolerance: 0.45, // 0.55 to 1.45 ratio (accommodates camera distortion)
  autoAnswerEnabled: true,
  debugOverlayEnabled: true,
  gridDetectionSensitivity: 4, // Minimum tiles detected to consider grid active
};

/**
 * Normalizes and clamps ROI boundaries relative to screen dimensions.
 */
function getPixelRect(roi: ROI, canvasWidth: number, canvasHeight: number) {
  const x = Math.max(0, Math.min(canvasWidth - 1, Math.round((roi.x / 100) * canvasWidth)));
  const y = Math.max(0, Math.min(canvasHeight - 1, Math.round((roi.y / 100) * canvasHeight)));
  const w = Math.max(1, Math.min(canvasWidth - x, Math.round((roi.width / 100) * canvasWidth)));
  const h = Math.max(1, Math.min(canvasHeight - y, Math.round((roi.height / 100) * canvasHeight)));
  return { x, y, w, h };
}

/**
 * Processes a single video frame canvas using OpenCV.js.
 */
export function processVideoFrame(
  srcCanvas: HTMLCanvasElement,
  settings: AppSettings,
  boardRoi: ROI,
  questionRoi: ROI
): FrameProcessingResult | null {
  const cv = window.cv;
  if (!cv || !cv.Mat) {
    return null;
  }

  const canvasWidth = srcCanvas.width;
  const canvasHeight = srcCanvas.height;

  // 1. Convert Canvas to OpenCV Mat
  let src: any = null;
  try {
    src = cv.imread(srcCanvas);
  } catch (err) {
    console.error('Failed to read canvas into OpenCV Mat', err);
    return null;
  }

  // Intermediate mats to clean up
  let boardCrop: any = null;
  let boardRgb: any = null;
  let boardHsv: any = null;
  let questionCrop: any = null;
  let questionRgb: any = null;
  let questionHsv: any = null;
  let kernel: any = null;

  const counts: DetectionResults = { green: 0, yellow: 0, blue: 0, total: 0 };
  const overlays: OverlayInfo[] = [];
  let detectedQuestion: ColorType | null = null;

  try {
    // ----------------------------------------------------
    // PROCESS BOARD ROI (TILES COUNTING)
    // ----------------------------------------------------
    const board = getPixelRect(boardRoi, canvasWidth, canvasHeight);
    const boardRect = new cv.Rect(board.x, board.y, board.w, board.h);
    boardCrop = src.roi(boardRect);

    // Convert RGBA -> RGB -> HSV
    boardRgb = new cv.Mat();
    cv.cvtColor(boardCrop, boardRgb, cv.COLOR_RGBA2RGB);
    boardHsv = new cv.Mat();
    cv.cvtColor(boardRgb, boardHsv, cv.COLOR_RGB2HSV);

    // Morphological structuring element (2x2 to preserve small tiles)
    kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));

    // Process Green, Yellow, Blue masks
    const colors: ColorType[] = ['green', 'yellow', 'blue'];
    colors.forEach((color) => {
      let mask = new cv.Mat();
      let low = null;
      let high = null;
      let contours = new cv.MatVector();
      let hierarchy = new cv.Mat();

      try {
        const threshold = settings.colors[color];
        low = cv.matFromArray(1, 3, cv.CV_8U, [threshold.hMin, threshold.sMin, threshold.vMin]);
        high = cv.matFromArray(1, 3, cv.CV_8U, [threshold.hMax, threshold.sMax, threshold.vMax]);

        // Filter color
        cv.inRange(boardHsv, low, high, mask);

        // Filter noise
        cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
        cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);

        // Find shapes
        cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        for (let i = 0; i < contours.size(); ++i) {
          const cnt = contours.get(i);
          const area = cv.contourArea(cnt);

          if (area >= settings.minArea && area <= settings.maxArea) {
            const bound = cv.boundingRect(cnt);
            const aspectRatio = bound.width / bound.height;
            const ratioDiff = Math.abs(1.0 - aspectRatio);

            if (ratioDiff <= settings.aspectRatioTolerance) {
              counts[color]++;
              overlays.push({
                type: color,
                rect: {
                  x: board.x + bound.x,
                  y: board.y + bound.y,
                  w: bound.width,
                  h: bound.height,
                },
              });
            }
          }
          cnt.delete();
        }
      } catch (err) {
        console.error(`Error processing color mask: ${color}`, err);
      } finally {
        // Safe releases
        if (mask) mask.delete();
        if (low) low.delete();
        if (high) high.delete();
        if (contours) contours.delete();
        if (hierarchy) hierarchy.delete();
      }
    });

    counts.total = counts.green + counts.yellow + counts.blue;

    // ----------------------------------------------------
    // PROCESS QUESTION ROI (TEXT HIGHLIGHT COLOR DETECTION)
    // ----------------------------------------------------
    if (questionRoi.width > 0 && questionRoi.height > 0) {
      const quest = getPixelRect(questionRoi, canvasWidth, canvasHeight);
      const questRect = new cv.Rect(quest.x, quest.y, quest.w, quest.h);
      questionCrop = src.roi(questRect);

      questionRgb = new cv.Mat();
      cv.cvtColor(questionCrop, questionRgb, cv.COLOR_RGBA2RGB);
      questionHsv = new cv.Mat();
      cv.cvtColor(questionRgb, questionHsv, cv.COLOR_RGB2HSV);

      let maxPixels = 0;
      const MIN_PIXELS_FOR_TEXT = 35; // minimum colored pixels to trigger question match

      colors.forEach((color) => {
        let mask = new cv.Mat();
        let low = null;
        let high = null;

        try {
          const threshold = settings.colors[color];
          low = cv.matFromArray(1, 3, cv.CV_8U, [threshold.hMin, threshold.sMin, threshold.vMin]);
          high = cv.matFromArray(1, 3, cv.CV_8U, [threshold.hMax, threshold.sMax, threshold.vMax]);

          cv.inRange(questionHsv, low, high, mask);
          const pixelCount = cv.countNonZero(mask);

          if (pixelCount > maxPixels && pixelCount >= MIN_PIXELS_FOR_TEXT) {
            maxPixels = pixelCount;
            detectedQuestion = color;
          }
        } catch (err) {
          console.error(`Error detecting question for ${color}`, err);
        } finally {
          if (mask) mask.delete();
          if (low) low.delete();
          if (high) high.delete();
        }
      });
    }

  } catch (err) {
    console.error('General CV Processing Error', err);
  } finally {
    // Delete all parent matrices to prevent leaks
    if (src) src.delete();
    if (boardCrop) boardCrop.delete();
    if (boardRgb) boardRgb.delete();
    if (boardHsv) boardHsv.delete();
    if (questionCrop) questionCrop.delete();
    if (questionRgb) questionRgb.delete();
    if (questionHsv) questionHsv.delete();
    if (kernel) kernel.delete();
  }

  return {
    counts,
    detectedQuestion,
    overlays,
  };
}
