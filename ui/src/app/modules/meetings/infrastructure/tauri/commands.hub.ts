import type { CombinedResultDto } from '../dto/summary.dto';
import type { ExternalSummaryDto } from '../dto/external-summary.dto';
import type { NoArgs } from './commands';

/** Signatures of the meeting-hub commands (ADR 0022), split out of `commands.ts` to keep it under the `max-lines` cap. */
export interface HubCommandSignatures {
  /** Whether the meeting's exported file is linked, missing or never exported (ADR 0022). */
  readonly get_export_link: {
    args: { readonly meetingId: string };
    result: { readonly state: 'linked' | 'missing' | 'notExported' | 'noFolder'; readonly path: string | null };
  };
  /** Makes the meeting adopt a Markdown file chosen inside the export folder. */
  readonly relink_export: { args: { readonly meetingId: string; readonly file: string }; result: void };
  /** Writes a fresh file for the meeting and links it; resolves with its path. */
  readonly recreate_export: { args: { readonly meetingId: string }; result: string };
  /** Forgets the stored link; the file stays where it is. */
  readonly unlink_export: { args: { readonly meetingId: string }; result: void };
  /** Scans the export folder for moved files; resolves with how many meetings were relinked. */
  readonly rescan_export_folder: { args: NoArgs; result: number };
  /** The user's own notes on a meeting (ADR 0022); empty when none. */
  readonly get_meeting_notes: { args: { readonly meetingId: string }; result: string };
  readonly set_meeting_notes: { args: { readonly meetingId: string; readonly text: string }; result: void };
  /** Adds one line, stamped `[hh:mm:ss]` when `atSec` is given; resolves with the full text. */
  readonly append_meeting_note: {
    args: { readonly meetingId: string; readonly text: string; readonly atSec: number | null };
    result: string;
  };
  /** Summaries the user pasted for a meeting (ADR 0022); add and delete resolve with the whole list. */
  readonly list_external_summaries: { args: { readonly meetingId: string }; result: readonly ExternalSummaryDto[] };
  readonly add_external_summary: {
    args: { readonly meetingId: string; readonly label: string; readonly markdown: string };
    result: readonly ExternalSummaryDto[];
  };
  readonly delete_external_summary: {
    args: { readonly meetingId: string; readonly summaryId: number };
    result: readonly ExternalSummaryDto[];
  };
  /** One model run over the transcript fills several summary tabs. */
  readonly summarize_combined: {
    args: { readonly meetingId: string; readonly templates: string[]; readonly language: string };
    result: CombinedResultDto;
  };
  /** The instructions of several tabs and the transcript as one Markdown text for an outside assistant. */
  readonly build_external_prompt: {
    args: { readonly meetingId: string; readonly templates: string[]; readonly language: string };
    result: string;
  };
  /** Splits a pasted report into one summary per tab. */
  readonly import_combined_report: {
    args: { readonly meetingId: string; readonly language: string; readonly text: string };
    result: CombinedResultDto;
  };
  /** Size, purge state and whether a purge is allowed for one meeting's audio (ADR 0022). */
  readonly get_audio_usage: {
    args: { readonly meetingId: string };
    result: { readonly bytes: number; readonly purged: boolean; readonly canPurge: boolean };
  };
  readonly purge_meeting_audio: {
    args: { readonly meetingId: string };
    result: { readonly count: number; readonly freedBytes: number };
  };
  /** How many meetings, and how many bytes, a purge of audio older than N days would free. */
  readonly preview_audio_purge: {
    args: { readonly olderThanDays: number };
    result: { readonly count: number; readonly bytes: number };
  };
  readonly purge_old_audio: {
    args: { readonly olderThanDays: number };
    result: { readonly count: number; readonly freedBytes: number };
  };
  /** The user's vocabulary text (one `heard = wanted` entry per line) and its application to existing meetings. */
  readonly get_dictionary: { args: NoArgs; result: string };
  readonly set_dictionary: { args: { readonly text: string }; result: void };
  readonly apply_dictionary_to_meetings: { args: NoArgs; result: number };
}
