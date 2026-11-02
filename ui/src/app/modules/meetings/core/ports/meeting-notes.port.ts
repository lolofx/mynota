/**
 * The user's own notes on a meeting (ADR 0022). Maps onto the Rust commands
 * get_meeting_notes, set_meeting_notes and append_meeting_note.
 */
export abstract class MeetingNotesPort {
  /** The notes text; empty when none were taken. */
  abstract get(meetingId: string): Promise<string>;
  /** Replaces the notes text. */
  abstract set(meetingId: string, text: string): Promise<void>;
  /** Adds one line, stamped with `atSec` as `[hh:mm:ss]` when given; resolves with the full text. */
  abstract append(meetingId: string, text: string, atSec: number | null): Promise<string>;
}
