import { computed, signal } from '@angular/core';

import {
  AUTO_AUDIO_LANGUAGE,
  isAudioLanguage,
  toExpectedSpeakers,
  type RecordingHints,
} from '../../core/models/recording-hints.model';
import type { PreferencesPort } from '../../core/ports/preferences.port';
import { AUDIO_LANGUAGE_PREFERENCE_KEY } from './meetings-store-preferences.util';

/**
 * What the user says about the NEXT recording: the language spoken and how
 * many remote speakers there are. The language default comes from Settings
 * and is persisted; a pick made at launch (and the speaker count) only
 * covers the next recording and is cleared once it has started. Plain
 * signals, not flurryx slots: these are tiny UI choices that need no
 * request status, and this keeps `MeetingsStore` inside its line budget.
 */
export class RecordingHintsState {
  private readonly defaultLanguageSignal = signal(AUTO_AUDIO_LANGUAGE);
  private readonly languageOverride = signal<string | null>(null);
  private readonly speakersSignal = signal<number | null>(null);

  /** The Settings default ('auto' = not specified). */
  readonly defaultLanguage = this.defaultLanguageSignal.asReadonly();
  /** The language the next recording uses: the launch-time pick, else the default. */
  readonly language = computed(() => this.languageOverride() ?? this.defaultLanguageSignal());
  /** Remote speakers announced for the next recording; `null` lets detection guess. */
  readonly speakers = this.speakersSignal.asReadonly();

  constructor(private readonly preferences: PreferencesPort) {
    const stored = preferences.get(AUDIO_LANGUAGE_PREFERENCE_KEY);
    if (isAudioLanguage(stored)) {
      this.defaultLanguageSignal.set(stored);
    }
  }

  /** Sets the default language AND persists it. */
  setDefaultLanguage(code: string): void {
    this.preferences.set(AUDIO_LANGUAGE_PREFERENCE_KEY, code);
    this.defaultLanguageSignal.set(code);
  }

  /** Language of the next recording only. */
  setLanguage(code: string): void {
    this.languageOverride.set(code);
  }

  /** Remote speakers of the next recording; out-of-range values become `null`. */
  setSpeakers(count: number | null): void {
    this.speakersSignal.set(toExpectedSpeakers(count));
  }

  /** What `start_recording` receives for the next recording. */
  current(): RecordingHints {
    return { language: this.language(), speakers: this.speakersSignal() };
  }

  /** The launch-time choices were for one meeting: the next starts from the default. */
  clearNextRecording(): void {
    this.languageOverride.set(null);
    this.speakersSignal.set(null);
  }
}
