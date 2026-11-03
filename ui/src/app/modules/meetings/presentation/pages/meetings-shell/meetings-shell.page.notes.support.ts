import type { Signal } from '@angular/core';
import { computed, effect, inject, signal, untracked } from '@angular/core';

import { AudioPurgeFacade } from '../../../application/facades/audio-purge.facade';
import { ExternalSummariesFacade } from '../../../application/facades/external-summaries.facade';
import { MeetingNotesFacade } from '../../../application/facades/meeting-notes.facade';
import { MeetingsFacade } from '../../../application/facades/meetings.facade';
import type { AudioUsage } from '../../../core/ports/audio-purge.port';
import type { ExternalSummary } from '../../../core/models/external-summary.model';
import type { PastedSummaryDraft } from '../../components/pasted-summaries/pasted-summaries.component';

/** "My notes" panel wiring (ADR 0022), grouped so `MeetingsShellPage` stays under the `max-lines` cap. */
export interface NotesControls {
  readonly visible: Signal<boolean>;
  readonly text: Signal<string>;
  readonly saving: Signal<boolean>;
  readonly error: Signal<string | null>;
  /** Seconds to stamp the next quick note with, or `null` for none. */
  readonly clockSec: Signal<number | null>;
  readonly onPlaybackTime: (seconds: number) => void;
  readonly onTextChanged: (text: string) => void;
  readonly onNoteAdded: (text: string) => void;
}

/**
 * Loads the notes of the open meeting and stamps quick notes with the clock
 * of the recording in progress, else with the playback position once the
 * audio has started. The facade is optional: specs that predate the notes
 * provide none, and the panel then stays hidden.
 */
export function createNotesControls(facade: MeetingsFacade, recordingElapsedSec: Signal<number>, isRecordingOpenMeeting: Signal<boolean>): NotesControls {
  const notes = inject(MeetingNotesFacade, { optional: true });
  const selection = facade as Partial<Pick<MeetingsFacade, 'selectedMeeting'>>;
  const selected = computed(() => selection.selectedMeeting?.() ?? null);
  const playbackSec = signal(0);

  effect(() => {
    const id = selected()?.id ?? null;
    untracked(() => void notes?.load(id));
  });

  return {
    visible: computed(() => notes !== null && selected() !== null),
    text: computed(() => notes?.text() ?? ''),
    saving: computed(() => notes?.saving() ?? false),
    error: computed(() => notes?.error() ?? null),
    clockSec: computed(() => {
      if (isRecordingOpenMeeting()) {
        return recordingElapsedSec();
      }
      return selected()?.hasAudio === true && playbackSec() > 0 ? playbackSec() : null;
    }),
    onPlaybackTime: (seconds) => playbackSec.set(seconds),
    onTextChanged: (text) => notes?.edit(text),
    onNoteAdded: (text) => {
      const at = isRecordingOpenMeeting() ? recordingElapsedSec() : selected()?.hasAudio === true && playbackSec() > 0 ? playbackSec() : null;
      void notes?.addNote(text, at);
    },
  };
}

/** The template whose prompt is handed to an outside assistant: the one-pass report. */
const PROMPT_TEMPLATE = 'full-report';

/** Pasted-summaries panel wiring (ADR 0022). */
export interface PastedSummariesControls {
  readonly visible: Signal<boolean>;
  readonly items: Signal<readonly ExternalSummary[]>;
  readonly working: Signal<boolean>;
  readonly error: Signal<string | null>;
  readonly promptCopied: Signal<boolean>;
  readonly onAdded: (draft: PastedSummaryDraft) => void;
  readonly onCopyPrompt: () => void;
  readonly onRemoved: (summaryId: number) => void;
}

/** Loads the pasted summaries of the open meeting; the facade is optional like the notes one. */
export function createPastedSummariesControls(facade: MeetingsFacade): PastedSummariesControls {
  const languageOf = facade as Partial<Pick<MeetingsFacade, 'selectedSummaryLanguage'>>;
  const summaryLanguage = (): string => languageOf.selectedSummaryLanguage?.() ?? 'en';
  const pasted = inject(ExternalSummariesFacade, { optional: true });
  const selection = facade as Partial<Pick<MeetingsFacade, 'selectedMeeting'>>;
  const selectedId = computed(() => selection.selectedMeeting?.()?.id ?? null);

  effect(() => {
    const id = selectedId();
    untracked(() => void pasted?.load(id));
  });

  return {
    visible: computed(() => pasted !== null && selectedId() !== null),
    items: computed(() => pasted?.items() ?? []),
    working: computed(() => pasted?.working() ?? false),
    error: computed(() => pasted?.error() ?? null),
    promptCopied: computed(() => pasted?.promptCopied() ?? false),
    onAdded: (draft) => void pasted?.add(draft.label, draft.markdown),
    onCopyPrompt: () => void pasted?.copyPrompt(PROMPT_TEMPLATE, summaryLanguage()),
    onRemoved: (summaryId) => void pasted?.remove(summaryId),
  };
}

/** Audio-purge strip wiring (ADR 0022). */
export interface AudioPurgeControls {
  readonly usage: Signal<AudioUsage | null>;
  readonly working: Signal<boolean>;
  readonly error: Signal<string | null>;
  readonly onPurge: () => void;
}

/**
 * Keeps the audio state of the open meeting fresh and handles the purge. The
 * facade is optional like the export-link one. The state is read again when
 * the meeting object changes, which covers a recording that just finished
 * and a re-transcription.
 */
export function createAudioPurgeControls(facade: MeetingsFacade): AudioPurgeControls {
  const purge = inject(AudioPurgeFacade, { optional: true });
  const selection = facade as Partial<Pick<MeetingsFacade, 'selectedMeeting'>>;
  const selectedId = (): string | null => selection.selectedMeeting?.()?.id ?? null;

  effect(() => {
    const id = selectedId();
    untracked(() => void purge?.refreshUsage(id));
  });

  return {
    usage: computed(() => purge?.usage() ?? null),
    working: computed(() => purge?.working() ?? false),
    error: computed(() => purge?.error() ?? null),
    onPurge: () => {
      const id = selectedId();
      if (id !== null) {
        void purge?.purge(id);
      }
    },
  };
}
