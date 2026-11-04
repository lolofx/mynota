/**
 * What the user says about a meeting before recording it. The speech model
 * cannot be pinned to a language, so the language is a hint kept with the
 * meeting (it drives the wrong-language check and the exported `language`
 * field); the remote speaker count pins the clustering of speaker detection.
 */

/** Value meaning "do not say which language is spoken". */
export const AUTO_AUDIO_LANGUAGE = 'auto';

/** Languages a meeting can be tagged with; mirrors the Rust `AUDIO_LANGUAGES`. */
export const AUDIO_LANGUAGE_CODES = ['fr', 'en', 'de', 'es', 'it', 'nl', 'pt'] as const;

/** Fewest and most remote speakers that can be announced; mirrors the Rust bounds. */
export const EXPECTED_SPEAKERS_MIN = 1;
export const EXPECTED_SPEAKERS_MAX = 12;

export interface RecordingHints {
  /** One of {@link AUDIO_LANGUAGE_CODES}, or {@link AUTO_AUDIO_LANGUAGE}. */
  readonly language: string;
  /** Remote speakers announced, or `null` to let speaker detection guess. */
  readonly speakers: number | null;
}

export const isAudioLanguage = (value: string | null): value is string =>
  value === AUTO_AUDIO_LANGUAGE || (value !== null && (AUDIO_LANGUAGE_CODES as readonly string[]).includes(value));

/** Keeps a whole number inside the allowed range; anything else means "not announced". */
export const toExpectedSpeakers = (value: unknown): number | null => {
  const count = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isInteger(count) && count >= EXPECTED_SPEAKERS_MIN && count <= EXPECTED_SPEAKERS_MAX ? count : null;
};
