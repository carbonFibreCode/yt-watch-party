import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom lacks ResizeObserver, which Radix sliders use to measure themselves.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe(): void {
      // Nothing to measure in jsdom.
    }
    unobserve(): void {
      // As above.
    }
    disconnect(): void {
      // As above.
    }
  };
}

afterEach(() => {
  cleanup();
});
