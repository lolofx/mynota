import { Injectable } from '@angular/core';

import { MeetingNotesPort } from '../../core/ports/meeting-notes.port';
import { invokeCommand } from './ipc';

/** `MeetingNotesPort` backed by the Tauri IPC command surface. */
@Injectable()
export class TauriMeetingNotesAdapter extends MeetingNotesPort {
  override async get(meetingId: string): Promise<string> {
    return invokeCommand('get_meeting_notes', { meetingId });
  }

  override async set(meetingId: string, text: string): Promise<void> {
    await invokeCommand('set_meeting_notes', { meetingId, text });
  }

  override async append(meetingId: string, text: string, atSec: number | null): Promise<string> {
    return invokeCommand('append_meeting_note', { meetingId, text, atSec });
  }
}
