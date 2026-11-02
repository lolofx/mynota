import { Injectable } from '@angular/core';

import { VocabularyPort } from '../../core/ports/vocabulary.port';

/** In-memory VocabularyPort implementation for specs. */
@Injectable()
export class InMemoryVocabularyFake extends VocabularyPort {
  text = '';
  /** What `applyToMeetings` reports. */
  corrected = 0;
  applied = 0;
  /** When set, `set` rejects with this message. */
  failSetWith: string | null = null;

  override async get(): Promise<string> {
    return this.text;
  }

  override async set(text: string): Promise<void> {
    if (this.failSetWith !== null) {
      throw new Error(this.failSetWith);
    }
    this.text = text;
  }

  override async applyToMeetings(): Promise<number> {
    this.applied += 1;
    return this.corrected;
  }
}
