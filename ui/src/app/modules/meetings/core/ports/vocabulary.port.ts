/**
 * The user's vocabulary: one line per entry, `heard = wanted` or a bare term.
 * Maps onto the Rust commands get_dictionary, set_dictionary and
 * apply_dictionary_to_meetings.
 */
export abstract class VocabularyPort {
  abstract get(): Promise<string>;
  abstract set(text: string): Promise<void>;
  /** Applies the vocabulary to the meetings already transcribed; resolves with the number of segments corrected. */
  abstract applyToMeetings(): Promise<number>;
}
