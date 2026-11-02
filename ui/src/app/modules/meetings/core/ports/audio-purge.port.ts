/** Size and purge state of one meeting's audio (ADR 0022). */
export interface AudioUsage {
  readonly bytes: number;
  readonly purged: boolean;
  /** A purge is allowed now: audio on disk, a transcript, not being recorded. */
  readonly canPurge: boolean;
}

/** What a purge freed, or would free. */
export interface PurgeSummary {
  readonly count: number;
  readonly bytes: number;
}

/**
 * Freeing the audio of meetings while keeping the rest. Maps onto the Rust
 * commands get_audio_usage, purge_meeting_audio, preview_audio_purge and
 * purge_old_audio.
 */
export abstract class AudioPurgePort {
  abstract usage(meetingId: string): Promise<AudioUsage>;
  abstract purge(meetingId: string): Promise<PurgeSummary>;
  /** How many meetings, and how much disk, a purge of the audio older than `olderThanDays` days would free. */
  abstract preview(olderThanDays: number): Promise<PurgeSummary>;
  abstract purgeOlderThan(olderThanDays: number): Promise<PurgeSummary>;
}
