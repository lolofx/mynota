/** A summary the user pasted from outside the app, kept under a label (ADR 0022). */
export interface ExternalSummary {
  readonly id: number;
  readonly label: string;
  readonly markdown: string;
  readonly createdAt: Date;
}
