# ADR 0024: One-Pass Report, Outside Assistants and a Stable Summary Stream

**Status**: Accepted, implemented on `win/audio-language` (Windows fork), recipe pending
**Date**: 2026-11-03
**Builds on**: [ADR 0018](0018-optional-selectable-summary-model.md), [ADR 0022](0022-meeting-hub-notes-and-linked-export.md)
**Context**: A one-hour meeting exposed three problems. Generating the summary and then the key points ran the webview out of memory, and the generation went on in the backend while the window showed nothing and refused any new summary as busy. Getting the summary, key points, decisions and actions took four runs, each re-reading the whole transcript. And there was no way to take the prompt and the transcript to an assistant outside the app.

## Decision

### The streamed summary no longer goes through the store's history

The summary text arrives in chunks about ten times a second. Each chunk was written to a flurryx slot, which records a deep copy of the **whole store** per update, with no limit. For a one-hour meeting that copy holds the transcript, and a map-reduce summary made of thousands of chunks filled the memory of the webview. The stream is now a plain signal, like the other high-rate state (`MeetingsStore` live hot path), with a regression test that counts the store history while 3000 chunks arrive.

### A summary that outlives its window is found again

The backend remembers which summary it is generating (`summarization_status`). At start-up the interface asks; if one is running it marks the template as generating, so the spinner and Stop appear and the streamed text shows, polls every two seconds until the run is over, then reads the saved result. Without this a reload during a summary left the interface idle and blocked.

### One template for the whole report

`full-report` produces the summary, key points, decisions and action items in a single generation, under four headings. The map-reduce of a long transcript uses the template for each chunk and again to combine, so the same single pass applies there. The four separate templates stay for those who want one thing only. It is the first tab.

### A prompt to take elsewhere

"Copy the prompt and transcript" (in the pasted summaries area) puts on the clipboard the `full-report` prompt with the speaker-named transcript inside, in the chosen summary language. The answer comes back through "Paste a summary". Nothing is sent by the app: the text only moves when the user copies it.

## Consequences

- The report in one pass asks more of a small local model than one section at a time; on the 1.5B and 3B models the sections may be thinner. The separate templates remain as the fallback.
- The copied prompt does not include the user's notes yet; they could be added with the Teams transcript, when it is imported.
