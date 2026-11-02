# Plan: meeting hub (ADR 0022)

Branch `win/meeting-hub`, from `win/lightweight`. One pull request per phase, merged in order; each phase leaves the app usable. Decision and rationale: [ADR 0022](../../../docs/adr/0022-meeting-hub-notes-and-linked-export.md).

Rules as in [resume-here.md](resume-here.md): one concern per commit, no personal data, no signature, Windows CI run once per batch of changes.

## Phase A: stable link and relinking

Goal: the exported file follows the meeting.

1. Back end: `export_path` on `Meeting` (`#[serde(default)]`), set by every export; re-export writes to it; recreate when missing.
2. Export contract: `mynota_id` and `status` in the front matter; marked blocks for transcript and summaries; merge-on-write that keeps text outside the markers; refuse when markers are absent.
3. Scan of the export folder by `mynota_id` (on start and on demand) that relinks moved files.
4. Commands: export state, relink to a chosen file, recreate, unlink.
5. UI: export-state strip in the meeting detail with the three actions; translations EN and FR.
6. Tests: renamed title keeps one file, file moved then rescanned, file deleted then recreated, edited text outside markers preserved, missing markers refused, old `meeting.json` loads.

Acceptance: rename a meeting, export again, one file in the vault; move the file in the vault, the meeting finds it again.

## Phase B: my notes

Goal: dictate or type remarks next to the transcript.

1. Back end: notes text per meeting (own file), load and save commands, guarded while another write is running.
2. UI: a collapsible "My notes" panel under the meeting detail (a panel rather than a tab: the detail tabs are the summary templates and the split layout); the summary template "Notes" is renamed "Minutes" / "Compte rendu" to avoid the clash. Live note box during recording and playback that prefixes the elapsed time.
3. Export: notes block, written last, never touched by a summary run.
4. Tests: notes survive re-transcription, re-summary and re-export; the time prefix matches the recording clock.

Acceptance: take notes during a 5-minute recording; they appear in the export under the transcript and the summaries.

## Phase C: pasted summaries

Goal: keep an outside assistant's summary with the meeting.

1. Back end: external summary kind with a user label; stored like any summary, excluded from regeneration and from "delete all generated".
2. UI: paste dialog in the summary panel; label shown on the tab.
3. Export: included as a summary block under its label.

Acceptance: paste a summary, restart the app, it is still there and exported.

## Phase D: audio purge

Goal: free disk space, keep everything else.

1. Back end: purge one meeting; list candidates older than N days with size; purge in bulk; refuse without a transcript.
2. UI: action in the meeting detail with confirmation; bulk dialog in Settings with count and size before confirming; disabled actions (re-transcribe, speakers) explained on a purged meeting.
3. Tests: files removed, meeting data intact, re-transcribe refused cleanly.

Acceptance: purge a meeting, the audio folder shrinks, transcript, notes and export are unchanged.

## Phase E: archive in the interface

Goal: tidy the list without losing anything.

1. The interface already had the archive action, the Archive section and its count (checked); nothing to add there.
2. Export: `status: archived` on archive, back on unarchive; the file stays in the vault.
3. Tests and translations.

Acceptance: archive a meeting, it leaves the list, shows under the filter, and its file says archived.

## README

The README already states the direction and marks unfinished features as *planned*. Each phase removes the *planned* mark of its own feature in the same pull request, so the README never promises more than the beta does. Add a screenshot of the notes tab and of the export state once phases A and B ship.

## After the phases

- Backlog row 10 (export formats) gets an "Obsidian" note: the vault-friendly Markdown is the contract of this ADR.
- Recipe (`docs/windows-recipe.md`): add a section for the link, notes, purge and archive on a real PC.
- Version bump and a beta per merged phase, not per commit.
