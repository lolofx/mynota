import type { Summary } from './summary.model';

/** What a combined report (generated or imported) did to the summary tabs. */
export interface CombinedResult {
  /** The summaries now saved, one per tab filled. */
  readonly saved: readonly Summary[];
  /** Tabs that were asked for and are missing from the report. */
  readonly missing: readonly string[];
  /** Sections of the report that match no tab. */
  readonly ignored: readonly string[];
}
