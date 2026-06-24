import { useState, useEffect } from 'react';

declare global {
  interface Window {
    cv: any;
    Module: any;
  }
}

export function useOpenCV() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [progressText, setProgressText] = useState('Checking OpenCV environment...');

  useEffect(() => {
    // If OpenCV is already loaded in window
    if (window.cv && window.cv.Mat) {
      setStatus('ready');
      return;
    }

    setProgressText('Configuring WebAssembly runtime...');

    // Set up Module callback before script load for OpenCV.js
    window.Module = {
      onRuntimeInitialized: () => {
        setProgressText('OpenCV.js runtime initialized!');
        setStatus('ready');
      },
      print: (text: string) => console.log('OpenCV: ', text),
      printErr: (text: string) => console.error('OpenCV Error: ', text),
    };

    // Check if script is already in document
    const existingScript = document.getElementById('opencv-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        // Wait for Module callback. If Module wasn't loaded, fallback
        setTimeout(() => {
          if (window.cv && window.cv.Mat) {
            setStatus('ready');
          }
        }, 1000);
      });
      existingScript.addEventListener('error', () => setStatus('error'));
      return;
    }

    setProgressText('Downloading OpenCV.js from CDN...');
    const script = document.createElement('script');
    script.id = 'opencv-script';
    script.src = 'https://docs.opencv.org/4.5.4/opencv.js';
    script.async = true;
    script.type = 'text/javascript';

    script.onload = () => {
      setProgressText('Initializing OpenCV.js structures...');
      // In case onRuntimeInitialized doesn't fire (e.g. non-WASM build fallback)
      setTimeout(() => {
        if (window.cv && window.cv.Mat) {
          setStatus('ready');
        }
      }, 2000);
    };

    script.onerror = () => {
      setProgressText('Failed to load OpenCV.js.');
      setStatus('error');
    };

    document.body.appendChild(script);

    return () => {
      // Cleanup is usually not desired as we want OpenCV to remain globally loaded,
      // but we can remove event listeners if necessary.
    };
  }, []);

  return { status, progressText };
}
