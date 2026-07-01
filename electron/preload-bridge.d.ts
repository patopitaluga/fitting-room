/** Global types for `window.fittingRoom` exposed by `electron/preload.js`. */
export {};

declare global {
  interface Window {
    fittingRoom: {
      captureScreen: () => Promise<string>;
      resizeToContent: (width: number, height: number) => Promise<void>;
    };
  }
}
