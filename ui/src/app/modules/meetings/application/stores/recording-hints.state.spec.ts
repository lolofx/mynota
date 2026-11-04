import { InMemoryPreferencesFake } from '../testing/in-memory-preferences.fake';
import { AUDIO_LANGUAGE_PREFERENCE_KEY } from './meetings-store-preferences.util';
import { RecordingHintsState } from './recording-hints.state';

describe('RecordingHintsState', () => {
  it('starts unspecified: auto language, no announced speakers', () => {
    const state = new RecordingHintsState(new InMemoryPreferencesFake());

    expect(state.current()).toEqual({ language: 'auto', speakers: null });
  });

  it('persists the default language and restores it in a new state', () => {
    const preferences = new InMemoryPreferencesFake();
    new RecordingHintsState(preferences).setDefaultLanguage('fr');

    expect(preferences.get(AUDIO_LANGUAGE_PREFERENCE_KEY)).toBe('fr');
    expect(new RecordingHintsState(preferences).defaultLanguage()).toBe('fr');
  });

  it('ignores a stored language that is not offered', () => {
    const preferences = new InMemoryPreferencesFake();
    preferences.set(AUDIO_LANGUAGE_PREFERENCE_KEY, 'klingon');

    expect(new RecordingHintsState(preferences).defaultLanguage()).toBe('auto');
  });

  it('lets a launch-time pick win over the default for the next recording only', () => {
    const state = new RecordingHintsState(new InMemoryPreferencesFake());
    state.setDefaultLanguage('fr');

    state.setLanguage('en');
    expect(state.language()).toBe('en');

    state.clearNextRecording();
    expect(state.language()).toBe('fr');
    expect(state.defaultLanguage()).toBe('fr');
  });

  it('keeps a whole speaker count in range and drops anything else', () => {
    const state = new RecordingHintsState(new InMemoryPreferencesFake());

    state.setSpeakers(4);
    expect(state.speakers()).toBe(4);
    state.setSpeakers(0);
    expect(state.speakers()).toBeNull();
    state.setSpeakers(13);
    expect(state.speakers()).toBeNull();
    state.setSpeakers(2.5);
    expect(state.speakers()).toBeNull();
  });

  it('forgets the announced speakers once the recording has started', () => {
    const state = new RecordingHintsState(new InMemoryPreferencesFake());
    state.setSpeakers(3);

    state.clearNextRecording();

    expect(state.speakers()).toBeNull();
  });
});
