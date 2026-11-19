import { signal } from '@angular/core';

/**
 * Test double for `SystemAudioGuardFacade` in page specs: never blocks and
 * runs the start straight away, so start assertions stay synchronous.
 */
export const systemAudioGuardFake = {
  block: signal(null).asReadonly(),
  status: signal(undefined).asReadonly(),
  allowStart: async () => true,
  startGuarded: async (start: () => Promise<void> | void) => start(),
  dismiss: (): void => undefined,
};
