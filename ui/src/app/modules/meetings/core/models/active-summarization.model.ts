/** The summary the backend is generating right now. */
export interface ActiveSummarization {
  readonly meetingId: string;
  readonly template: string;
  readonly language: string;
  /** The tabs a combined run fills; empty for a single-template run. */
  readonly templates: readonly string[];
}
