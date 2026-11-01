import type { ExternalSummary } from '../models/external-summary.model';

/**
 * Summaries pasted from outside the app. Maps onto the Rust commands
 * list_external_summaries, add_external_summary and delete_external_summary;
 * add and delete resolve with the whole list.
 */
export abstract class ExternalSummariesPort {
  abstract list(meetingId: string): Promise<readonly ExternalSummary[]>;
  abstract add(meetingId: string, label: string, markdown: string): Promise<readonly ExternalSummary[]>;
  abstract remove(meetingId: string, summaryId: number): Promise<readonly ExternalSummary[]>;
}
