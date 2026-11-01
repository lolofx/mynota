import { Injectable } from '@angular/core';

import { MeetingNotesPort } from '../../core/ports/meeting-notes.port';

const pad = (n: number): string => String(n).padStart(2, '0');

/** In-memory MeetingNotesPort implementation for specs; mirrors the Rust stamping. */
@Injectable()
export class InMemoryMeetingNotesFake extends MeetingNotesPort {
  readonly notes = new Map<string, string>();
  /** Texts passed to `set`, in call order. */
  readonly saved: string[] = [];
  /** When set, `set` rejects with this message. */
  failSetWith: string | null = null;

  override async get(meetingId: string): Promise<string> {
    return this.notes.get(meetingId) ?? '';
  }

  override async set(meetingId: string, text: string): Promise<void> {
    if (this.failSetWith !== null) {
      throw new Error(this.failSetWith);
    }
    this.saved.push(text);
    this.notes.set(meetingId, text);
  }

  override async append(meetingId: string, text: string, atSec: number | null): Promise<string> {
    let notes = this.notes.get(meetingId) ?? '';
    if (notes !== '' && !notes.endsWith('\n')) {
      notes += '\n';
    }
    const total = Math.floor(atSec ?? 0);
    const stamp = atSec === null ? '' : `[${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}] `;
    notes += `${stamp}${text.trim()}\n`;
    this.notes.set(meetingId, notes);
    return notes;
  }
}
