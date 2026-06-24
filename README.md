# Lightweight Real-Time GTA RP Color Count Assistant

A high-performance, client-side web application designed to assist with GTA RP "Color Count" style memory minigames. Built using Vite, React, TypeScript, and OpenCV.js.

---

## 🚀 Key Features

1. **Client-Side Screen Capture**: Stream GTA V directly using `navigator.mediaDevices.getDisplayMedia`.
2. **Real-time Color Counting**: Uses OpenCV.js (WebAssembly) to extract and count Green, Yellow, and Blue grid tiles in near real-time.
3. **Smart Question recognition HUD**: Dynamically detects the target color in the question text using a rapid pixel-density color heuristic (under 2ms, zero OCR delay).
4. **Auto-Answer Mode**:
   - Grid appears -> system counts and updates active tiles.
   - Grid disappears -> counts are automatically **locked/frozen**.
   - Question appears -> system detects the asked color and displays the correct count instantly.
5. **Ultra Low CPU Optimization**: High-frequency visual elements (FPS counters, latency metrics, and tile tallies) bypass React state cycles and update the DOM directly, preserving system resources so you can run the game and stream at 30+ FPS.
6. **Dual Custom ROIs (Region of Interest)**: Easily resize and reposition both the **Board ROI** and **Question ROI** directly on the preview screen using click-and-drag or slider adjustments.
7. **Overlay Visualizer**: Bounding boxes and color labels drawn dynamically on active tiles (can be disabled).
8. **Keyboard Hotkey Overrides**:
   - `G` - Trigger Green manual query.
   - `Y` - Trigger Yellow manual query.
   - `B` - Trigger Blue manual query.
   - `R` - Clear counters and reset the state machine.
   - `F` - Freeze frame toggle.

---

## 🛠️ Tech Stack

- **Framework**: Vite + React (TypeScript)
- **Computer Vision**: OpenCV.js (WASM, loaded asynchronously from official docs CDN)
- **Styling**: Vanilla CSS (Cyberpunk/Neon Gaming theme, HSL coordinates, glassmorphism panel interfaces, and hover micro-animations)
- **Icons**: Lucide React

---

## ⚙️ Local Development Setup

To run this application locally:

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Launch Development Server**:
   ```bash
   npm run dev
   ```

3. **Open in Browser**:
   Open the local address provided (typically `http://localhost:5173`) in your browser.

4. **Verify Build**:
   ```bash
   npm run build
   ```

---

## 📂 Project Structure

- `src/main.tsx` - App entry point.
- `src/App.tsx` - Core React architecture, screen capture controls, state transitions, visual HUD panels, and animation loops.
- `src/App.css` - Custom styling system (glassmorphism tabs, range inputs, counters, and indicators).
- `src/types.ts` - TypeScript interfaces for settings, thresholds, ROI, and app states.
- `src/hooks/useOpenCV.ts` - Dynamically loads OpenCV.js from CDN with full module loading safety checks.
- `src/utils/cvEngine.ts` - Bounding-box computations, HSV color segmentation, morph operations, aspect ratio filters, and memory-safe contour cleanups.
- `vercel.json` - Custom routes setup for Vercel deployment.

---

## 🎮 How to Calibrate & Play

1. **Launch the Web App** and hit **Start Screen Capture**.
2. Share the screen/window containing your GTA RP game or practice simulator.
3. Toggle the **ROI Calibration Mode** in the bottom-right panel:
   - Click **Map Board Region** and drag your cursor over the grid where the colored tiles appear.
   - Click **Map Question Region** and drag your cursor over the text area where the question is displayed.
4. If needed, open the **HSV Tuning** tab to calibrate the color values. Defaults are pre-tuned for typical GTA V memory grids.
5. In game:
   - Keep your hands off! The assistant will automatically track active colors, lock the values when the grid goes blank, scan the question text, and output the correct answer.
   - If the text color doesn't match the background, press `G`, `Y`, or `B` to instantly output the locked counts.

---

## 🌐 Deployment to Vercel

This app contains **no backend or database** and is designed to run 100% client-side in the browser. It can be deployed directly to Vercel:

1. Push this folder to a GitHub repository.
2. Link the repository to your Vercel Dashboard.
3. Vercel will auto-detect Vite:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Deploy!
