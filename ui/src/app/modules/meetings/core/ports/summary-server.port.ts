import type { SummaryServer } from '../models/summary-server.model';

/**
 * The optional summary server (ADR 0021). Maps onto the Rust commands
 * `get_summary_server`, `set_summary_server` and `list_summary_server_models`.
 */
export abstract class SummaryServerPort {
  abstract get(): Promise<SummaryServer>;
  /** Rejects when an enabled server has no valid address or no model. */
  abstract save(server: SummaryServer): Promise<void>;
  /** Contacts the server and returns its model names; rejects with a readable reason when it cannot. */
  abstract listModels(url: string): Promise<readonly string[]>;
}
