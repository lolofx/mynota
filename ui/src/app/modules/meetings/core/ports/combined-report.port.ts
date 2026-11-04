import type { CombinedResult } from '../models/combined-report.model';

/**
 * One report for several summary tabs. Maps onto the Rust commands
 * summarize_combined, build_external_prompt and import_combined_report.
 */
export abstract class CombinedReportPort {
  /** Fills `templates` from one model run over the transcript. */
  abstract generate(meetingId: string, templates: readonly string[], language: string): Promise<CombinedResult>;
  /**
   * The instructions of `templates` and the transcript as one Markdown text
   * for an assistant outside the app, which answers in the standard format.
   */
  abstract buildPrompt(meetingId: string, templates: readonly string[], language: string): Promise<string>;
  /** Splits a pasted report into one summary per tab. */
  abstract importReport(meetingId: string, language: string, text: string): Promise<CombinedResult>;
}
