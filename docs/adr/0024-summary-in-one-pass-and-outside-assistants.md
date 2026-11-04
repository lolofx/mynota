# ADR 0024: Several Summaries in One Pass, Outside Assistants and a Stable Summary Stream

**Status**: Accepted, implemented on `win/audio-language` (Windows fork), recipe pending
**Date**: 2026-11-03
**Builds on**: [ADR 0018](0018-optional-selectable-summary-model.md), [ADR 0022](0022-meeting-hub-notes-and-linked-export.md)
**Context**: A one-hour meeting exposed four problems. Generating the summary and then the key points ran the webview out of memory, and the generation went on in the backend while the window showed nothing and refused any new summary as busy. Each tab (summary, key points, decisions, actions) was a separate run that re-read the whole transcript. There was no way to take the instructions and the transcript to an assistant outside the app and bring the answer back into the tabs. And the instructions of a tab (its skill) could only be edited from inside an open meeting.

## Decision

### The streamed summary no longer goes through the store's history

The summary text arrives in chunks about ten times a second. Each chunk was written to a flurryx slot, which records a deep copy of the **whole store** per update, with no limit. For a one-hour meeting that copy holds the transcript, and a map-reduce summary made of thousands of chunks filled the memory of the webview. The stream is now a plain signal, like the other high-rate state (`MeetingsStore` live hot path), with a regression test that counts the store history while 3000 chunks arrive.

### A summary that outlives its window is found again

The backend remembers which summary it is generating (`summarization_status`, with the tabs of a combined run). At start-up the interface asks; if one is running it marks it as generating, so the spinner and Stop appear and the streamed text shows, polls every two seconds until the run is over, then reads the saved result of every tab. Without this a reload during a summary left the interface idle and blocked.

### Several tabs from one reading of the transcript

The user ticks the tabs to fill ("Several summaries at once", under the meeting). One model run reads the transcript once and writes every ticked tab. The prompt is built from the skills of the ticked tabs:

- A **skill** is the summary template. What it asks for is its effective prompt up to the transcript (`skill_instruction`), so an edit of the skill is what the tab *and* the combined report use. Templates the user wrote take part like the built-in ones.
- The output has one block per tab, introduced by a line `### SECTION: <template name>`. The parser is forgiving about heading depth, bold, case and `:` or `-`, drops anything before the first marker, and keeps the first of a repeated section.
- A long transcript goes through the same map-reduce as before: the combined prompt is used for each chunk and again to merge the partial reports.
- The sections are split back into one summary per tab, saved and exported like any other. A tab the model left out is named. If no section is found the run fails with a clear message.

The four separate tabs stay for one-off generation; a tab-by-tab run is still the fallback for a small model that does not follow the format.

### An outside assistant, with the same format

"Copy the request for an assistant" puts on the clipboard one Markdown text holding the instructions of the ticked skills, the output format, and the speaker-named transcript. Nothing is sent by the app: the text moves only when the user copies it. The assistant's answer is pasted into "Import a report", which splits it with the same parser and fills the tabs. A section whose name is no template is reported, not saved.

### Skills are edited from Settings

Settings (Summaries) lists the skills with an **Edit** button that opens the same prompt editor as a tab's cogwheel, with no meeting open. The cogwheel stays.

## Consequences

- A combined report asks more of a small local model than one section at a time; on the 1.5B and 3B models the sections may be thinner or the format may drift. The tab-by-tab generation and the outside assistant are the ways around it.
- Which skills apply to a meeting is the ticked set, remembered between uses; it is not stored per meeting yet.
- The copied request does not include the user's own notes; they could be added together with an imported Teams transcript.
- The skill text is cut at `{transcript}`; text after it (such as the closing cue "Key Points:") does not reach the combined prompt.
