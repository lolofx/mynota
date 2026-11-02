import { Injectable, inject, signal } from '@angular/core';

import { MeetingNotesPort } from '../../core/ports/meeting-notes.port';

/** Quiet time after the last keystroke before the notes are written. */
export const NOTES_SAVE_DELAY_MS = 600;

/**
 * The open meeting's own notes (ADR 0022). Typing is kept on screen at once
 * and written after a short pause; changing meeting or adding a quick note
 * writes what is pending first, so nothing typed is lost. Provided at the
 * route injector, never `providedIn: 'root'`.
 */
@Injectable()
export class MeetingNotesFacade {
  private readonly port = inject(MeetingNotesPort);

  private readonly textState = signal('');
  private readonly errorState = signal<string | null>(null);
  private readonly savingState = signal(false);
  private meetingId: string | null = null;
  private pending: { readonly id: string; readonly text: string } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private loadRequest = 0;

  /** Notes of the meeting on screen. */
  readonly text = this.textState.asReadonly();
  /** Message of the last failed load or save; `null` once the next one starts. */
  readonly error = this.errorState.asReadonly();
  /** True while a write is in flight. */
  readonly saving = this.savingState.asReadonly();

  /** Shows the notes of `meetingId` (`null`: no meeting), after writing any pending edit of the previous one. */
  async load(meetingId: string | null): Promise<void> {
    await this.flush();
    const request = ++this.loadRequest;
    this.meetingId = meetingId;
    this.errorState.set(null);
    this.textState.set('');
    if (meetingId === null) {
      return;
    }
    try {
      const text = await this.port.get(meetingId);
      if (request === this.loadRequest) {
        this.textState.set(text);
      }
    } catch (error) {
      if (request === this.loadRequest) {
        this.errorState.set(messageOf(error));
      }
    }
  }

  /** Keeps `text` on screen and writes it once typing pauses. */
  edit(text: string): void {
    if (this.meetingId === null) {
      return;
    }
    this.textState.set(text);
    this.pending = { id: this.meetingId, text };
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => void this.flush(), NOTES_SAVE_DELAY_MS);
  }

  /** Writes the pending edit now, if any. */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const edit = this.pending;
    if (edit === null) {
      return;
    }
    this.pending = null;
    this.savingState.set(true);
    this.errorState.set(null);
    try {
      await this.port.set(edit.id, edit.text);
    } catch (error) {
      this.errorState.set(messageOf(error));
    } finally {
      this.savingState.set(false);
    }
  }

  /** Adds one line, stamped with `atSec` when given, after writing any pending edit. */
  async addNote(text: string, atSec: number | null): Promise<void> {
    const id = this.meetingId;
    if (id === null || text.trim() === '') {
      return;
    }
    await this.flush();
    this.errorState.set(null);
    try {
      const all = await this.port.append(id, text, atSec);
      if (id === this.meetingId) {
        this.textState.set(all);
      }
    } catch (error) {
      this.errorState.set(messageOf(error));
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
