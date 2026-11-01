/** An Ollama server on the user's own network that writes the summaries instead of the local model. */
export interface SummaryServer {
  readonly url: string;
  readonly model: string;
  readonly enabled: boolean;
}

export const EMPTY_SUMMARY_SERVER: SummaryServer = { url: '', model: '', enabled: false };
