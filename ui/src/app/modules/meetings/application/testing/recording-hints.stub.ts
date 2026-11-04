import type { PreferencesPort } from '../../core/ports/preferences.port';
import { RecordingHintsState } from '../stores/recording-hints.state';

/** A real `RecordingHintsState` over throwaway preferences, for specs that stub the whole facade. */
export const createRecordingHintsStub = (): RecordingHintsState =>
  new RecordingHintsState({ get: () => null, set: () => undefined } as unknown as PreferencesPort);
