/** Mirrors the Rust `SummaryServerDto` (`#[serde(rename_all = "camelCase")]`). */
export interface SummaryServerDto {
  readonly url: string;
  readonly model: string;
  readonly enabled: boolean;
}
