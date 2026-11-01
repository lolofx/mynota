/** Where a meeting's exported file stands (ADR 0022). `noFolder`: exporting is off. */
export type ExportLinkState = 'linked' | 'missing' | 'notExported' | 'noFolder';

export interface ExportLink {
  readonly state: ExportLinkState;
  /** Absolute path of the file, only while `state` is `linked`. */
  readonly path: string | null;
}

/**
 * The folder every meeting is exported to as one Markdown file (PRD R5).
 * Maps onto the Rust commands get_export_prefs, set_export_folder and
 * export_meeting_to_folder. Exporting happens automatically once a folder is
 * set; there is no separate on/off switch.
 */
export abstract class ExportFolderPort {
  /** The configured absolute folder, or `null` while exporting is off. */
  abstract get(): Promise<string | null>;
  /**
   * Sets the export folder (created when missing), or turns exporting off
   * with `null`. Rejects when the path is not absolute or cannot be used;
   * the stored setting is untouched on failure.
   */
  abstract set(folder: string | null): Promise<void>;
  /** Exports one meeting into the folder now and resolves with the file path. */
  abstract exportMeeting(meetingId: string): Promise<string>;
  /** Whether the meeting's exported file is linked, missing or never exported. */
  abstract getLink(meetingId: string): Promise<ExportLink>;
  /** Makes the meeting adopt `file`, a Markdown file inside the export folder. Rejects when it cannot. */
  abstract relink(meetingId: string, file: string): Promise<void>;
  /** Writes a fresh file for the meeting, links it and resolves with its path. */
  abstract recreate(meetingId: string): Promise<string>;
  /** Forgets the stored link without touching the file. */
  abstract unlink(meetingId: string): Promise<void>;
  /** Scans the folder for moved files and resolves with the number of meetings relinked. */
  abstract rescan(): Promise<number>;
}
