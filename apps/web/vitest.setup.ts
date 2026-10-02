import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * jsdom does not implement matchMedia, which the responsive shell reads on
 * mount. It is installed once here rather than per test file so no test can
 * render a component that touches it before its own stub exists.
 */
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});