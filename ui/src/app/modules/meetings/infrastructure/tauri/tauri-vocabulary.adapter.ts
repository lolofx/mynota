import { Injectable } from '@angular/core';

import { VocabularyPort } from '../../core/ports/vocabulary.port';
import { invokeCommand } from './ipc';

/** `VocabularyPort` backed by the Tauri IPC command surface. */
@Injectable()
export class TauriVocabularyAdapter extends VocabularyPort {
  override async get(): Promise<string> {
    return invokeCommand('get_dictionary', {});
  }

  override async set(text: string): Promise<void> {
    await invokeCommand('set_dictionary', { text });
  }

  override async applyToMeetings(): Promise<number> {
    return invokeCommand('apply_dictionary_to_meetings', {});
  }
}
