/** The summary the backend is generating right now. */
export interface ActiveSummarization {
  readonly meetingId: string;
  readonly template: string;
  readonly language: string;
}
