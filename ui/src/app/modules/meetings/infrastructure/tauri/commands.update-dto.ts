// Wire shapes of the updater commands, split out of `commands.ts` to keep it under the `max-lines` cap.

/** Mirrors the Rust `UpdateConsent` (`#[serde(rename_all = "lowercase")]`). */
export type UpdateConsentDto = 'unset' | 'granted' | 'declined';

/** Mirrors the Rust `UpdateCheckStatus` (`#[serde(rename_all = "kebab-case")]`). */
export type UpdateCheckStatusDto = 'available' | 'up-to-date' | 'skipped' | 'failed';

/** Mirrors the Rust `UpdateSkipReason` (`#[serde(rename_all = "kebab-case")]`). */
export type UpdateSkipReasonDto = 'no-consent' | 'throttled' | 'recording';

/**
 * Mirrors the Rust `UpdateDonePayload` (`#[serde(rename_all = "camelCase")]`,
 * `app/src-tauri/src/events.rs`) — the exact value `install_update`
 * resolves with AND the payload it emits on `update://done` (one shape,
 * built once Rust-side; pinned by the serde wire-shape tests in
 * `commands/update_install.rs`). Gate refusals never produce this: they
 * reject the invoke with the typed `{code, message}` error envelope.
 */
export interface UpdateInstallResultDto {
  readonly success: boolean;
  readonly version: string | null;
  readonly message: string | null;
}

/** Mirrors the Rust `UpdateCheckDto` (`#[serde(rename_all = "camelCase")]`). */
export interface UpdateCheckDto {
  readonly status: UpdateCheckStatusDto;
  readonly version?: string;
  readonly notes?: string;
  readonly downloadUrl?: string;
  readonly reason?: UpdateSkipReasonDto;
  readonly message?: string;
}
