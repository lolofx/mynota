/** Mirrors the Rust `ExternalSummaryDto` (`#[serde(rename_all = "camelCase")]`). */
export interface ExternalSummaryDto {
  readonly id: number;
  readonly label: string;
  readonly markdown: string;
  readonly createdAt: string;
}
