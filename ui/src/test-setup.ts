import '@angular/compiler';

import { TestBed } from '@angular/core/testing';
import { config } from 'rxjs';
import { provideAppInitializer } from '@angular/core';

import { provideI18n } from './app/i18n/i18n.providers';
import { UI_LANGUAGE_PREFERENCE_KEY } from './app/i18n/supported-languages';

// Every spec renders with the real English catalogue, so text assertions stay meaningful.
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      // A language picked in one spec must not leak into the next one through localStorage.
      provideAppInitializer(() => localStorage.removeItem(UI_LANGUAGE_PREFERENCE_KEY)),
      provideI18n(),
    ],
  });
});

// jsdom has no Tauri IPC: an event stream opened after a spec removed its stub rejects asynchronously and
// would be reported as an unhandled error attributed to whichever spec happens to be running.
window.addEventListener(
  'error',
  (event) => {
    if (String(event.error?.message ?? event.message).includes('transformCallback')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);

// Same cause seen from rxjs: a stream without an error handler reports the missing-IPC failure through a timer.
config.onUnhandledError = (error) => {
  if (!String((error as { message?: unknown } | null)?.message ?? error).includes('transformCallback')) {
    throw error;
  }
};

// Known, expected console noise (no Tauri runtime, no media playback in jsdom). Flushing hundreds of these while a
// worker shuts down makes vitest 4 report "Closing rpc while onUserConsoleLog was pending".
const realConsoleError = console.error.bind(console);
console.error = (...args: unknown[]): void => {
  const text = args.map((arg) => String((arg as { message?: unknown } | null)?.message ?? arg)).join(' ');
  if (text.includes('transformCallback') || text.includes('Not implemented: HTMLMediaElement')) {
    return;
  }
  realConsoleError(...args);
};
