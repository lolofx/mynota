# ADR 0023: Meeting Language and Remote Speaker Count

**Status**: Accepted, implemented on `win/audio-language` (Windows fork), recipe pending
**Date**: 2026-11-03
**Builds on**: [ADR 0002: Parakeet v3](0002-parakeet-v3.md), [ADR 0019: Markdown Export Contract](0019-markdown-export-contract-and-export-folder.md)
**Context**: A first real meeting (French, with some English) showed two defects of the transcript. Short or noisy segments come out as English ("Let's see.", "Wait."), and speaker detection merges several remote speakers into one, which makes naming them afterwards tedious.

## Decision

The user can say, before recording, **which language is spoken** and **how many people speak on the remote side**. Both are optional and stored with the meeting.

### Language

- A default is set in Settings (General). The Audio menu of the title bar can override it for the next recording only, then the next recording starts from the default again. `auto` means "not specified".
- The language is one of `fr`, `en`, `de`, `es`, `it`, `nl`, `pt`, kept on the meeting as `audio_language`.
- **It does not change how the speech model decodes.** Parakeet-TDT v3 has no language parameter (ADR 0002); pinning a language needs another model family. What the language does:
  - It is written to the export front matter as `language`, which closes the open risk of ADR 0019.
  - Segments that read as the other of French and English are marked "possibly mis-transcribed" with the reason `WrongLanguage`. The check counts function words that belong to one language only and flags a segment when most of its words are the other language's and none is the expected one (`crates/myna-stt/src/language_check.rs`). Loanwords inside a sentence, and acknowledgements French speakers say in English such as "okay", do not trigger it. Other languages have no word list and are never flagged.
  - The mark is derived each time a meeting is presented and never stored, so it follows a language change and disappears once the segment is corrected.
- The summary language is a separate setting. An English meeting can be summarized in French.

### Remote speaker count

- Chosen in the same menu, 1 to 12, for the next recording only. It applies to the system track, so the microphone ("Me") is not counted.
- When set, "Detect speakers" no longer lets the centroid merge of [ADR 0016](0016-diarization-centroid-merge.md) decide. The clusterer is asked for twice as many clusters as announced (at most 32), clusters with under 3 s of speech are dissolved into their nearest neighbour, then the two most similar clusters merge until at most the announced number is left (`merge_to_count`). It never splits: fewer people found than announced stays as found. Without a count nothing changes.
- **Why not pin the cluster count in the clusterer.** A first version did, and a one-hour meeting with ten people came back with two clusters of a single segment each while real speakers stayed merged: cutting the clustering at `k` keeps outliers as clusters of their own.
- The diarizer is loaded per run, so the count is read from the meeting each time.

## Consequences

- The language choice reduces review work, not errors: the wrong-language lines are still in the transcript, only marked. A real language lock would need Whisper or another model, left to a later decision (backlog phase 11).
- The word lists are small and tuned on one French meeting. They will need widening with more meetings; false negatives (an English line made of words found in both languages' lists) are accepted, false positives are the thing to watch.
- Announcing too few speakers merges people, too many splits one person; the count is a hint the user can leave empty.
