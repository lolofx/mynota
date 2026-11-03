import { Injectable, inject } from '@angular/core';

import { withSummary } from '../../core/models/meeting.model';
import { toMeetingId } from '../../core/models/meeting.model';
import { SummarizerPort } from '../../core/ports/summarizer.port';
import { MeetingsStore } from '../stores/meetings.store';

/** How often the backend is asked whether the resumed summary has finished. */
export const SUMMARY_RESUME_POLL_MS = 2000;

/**
 * Re-attaches the UI to a summary that kept running in the backend after the
 * webview reloaded or crashed. Without it the interface shows nothing while
 * every new summary is refused as busy, and nobody can stop the run.
 *
 * It marks the template as generating (so the spinner and Stop show, and the
 * streamed tokens that keep arriving are displayed), then asks the backend
 * every {@link SUMMARY_RESUME_POLL_MS} until the run is over and reads the
 * saved result. Provided at the route injector, never `providedIn: 'root'`.
 */
@Injectable()
export class SummaryResumeFacade {
  private readonly summarizer = inject(SummarizerPort);
  private readonly store = inject(MeetingsStore);

  /** Never rejects: a failed query just means there is nothing to resume. */
  async resume(): Promise<void> {
    try {
      const active = await this.summarizer.activeSummarization();
      if (active === null) {
        return;
      }
      this.store.resetSummaryStream();
      this.store.setSummarizingKey({ template: active.template, language: active.language });
      await this.untilFinished();
      await this.landResult(active.meetingId, active.template, active.language);
    } catch (caught) {
      console.warn('resumeActiveSummarization failed', caught);
    } finally {
      this.store.setSummarizingKey(null);
    }
  }

  private async untilFinished(): Promise<void> {
    do {
      await new Promise<void>((resolve) => setTimeout(resolve, SUMMARY_RESUME_POLL_MS));
    } while ((await this.summarizer.activeSummarization()) !== null);
  }

  /** Puts the saved summary, if the run produced one, where a normal run would have. */
  private async landResult(meetingId: string, template: string, language: string): Promise<void> {
    const id = toMeetingId(meetingId);
    const summary = await this.summarizer.getSummary(id, template, language);
    if (summary === null) {
      return;
    }
    const current = this.store.selectedMeeting();
    if (current && current.id === id) {
      this.store.setSelectedMeeting(withSummary(current, summary));
    }
    this.store.setSummaryCacheResult(id, summary.template, summary.language, summary);
  }
}
