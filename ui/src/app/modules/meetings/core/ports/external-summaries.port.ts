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
  /**
   * The whole prompt of `template` with the meeting's transcript inside, to
   * hand to an assistant outside the app (Rust command build_external_prompt).
   */
  abstract buildPrompt(meetingId: string, template: string, language: string): Promise<string>;
}
