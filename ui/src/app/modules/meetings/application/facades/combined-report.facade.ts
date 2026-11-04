import { Injectable, inject, signal } from '@angular/core';

import type { CombinedResult } from '../../core/models/combined-report.model';
import { withSummary } from '../../core/models/meeting.model';
import { toMeetingId } from '../../core/models/meeting.model';
import { CombinedReportPort } from '../../core/ports/combined-report.port';
import { PreferencesPort } from '../../core/ports/preferences.port';
import { SummarizerPort } from '../../core/ports/summarizer.port';
import { MeetingsStore } from '../stores/meetings.store';

/** localStorage key the ticked summary tabs of the combined report are remembered under. */
export const COMBINED_TEMPLATES_PREFERENCE_KEY = 'meetings.combinedTemplates';

/** Outcome of the last action, for a short line under the panel. */
export interface CombinedOutcome {
  readonly kind: 'generated' | 'imported';
  readonly saved: number;
  readonly missing: readonly string[];
  readonly ignored: readonly string[];
}

/**
 * Several summary tabs from one reading of the transcript, or from a report
 * an outside assistant wrote in the same standard format. Never optimistic:
 * the tabs change only once the backend has saved the sections. Provided at
 * the route injector, never `providedIn: 'root'`.
 */
@Injectable()
export class CombinedReportFacade {
  private readonly port = inject(CombinedReportPort);
  private readonly summarizer = inject(SummarizerPort);
  private readonly preferences = inject(PreferencesPort);
  private readonly store = inject(MeetingsStore);

  private readonly selectedState = signal<readonly string[]>(this.readSelection());
  private readonly workingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly outcomeState = signal<CombinedOutcome | null>(null);
  private readonly copiedState = signal(false);

  /** Names of the ticked tabs. */
  readonly selected = this.selectedState.asReadonly();
  readonly working = this.workingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly outcome = this.outcomeState.asReadonly();
  /** `true` from a successful copy of the request until the next action. */
  readonly requestCopied = this.copiedState.asReadonly();

  /** Ticks or unticks a tab and remembers the choice. */
  toggle(name: string, checked: boolean): void {
    const without = this.selectedState().filter((entry) => entry !== name);
    const next = checked ? [...without, name] : without;
    this.selectedState.set(next);
    try {
      this.preferences.set(COMBINED_TEMPLATES_PREFERENCE_KEY, next.join(','));
    } catch {
      // A choice that cannot be remembered is still used for this session.
    }
  }

  /** Generates the ticked tabs from one run of the model. */
  async generate(meetingId: string, language: string): Promise<boolean> {
    const templates = this.selectedState();
    this.startAction();
    this.store.resetSummaryStream();
    this.store.setSummarizingKey({ template: 'combined', language });
    try {
      this.land(meetingId, language, await this.port.generate(meetingId, templates, language), 'generated');
      return true;
    } catch (error) {
      if (!/cancelled/i.test(messageOf(error))) {
        this.errorState.set(messageOf(error));
      }
      return false;
    } finally {
      this.store.setSummarizingKey(null);
      this.workingState.set(false);
    }
  }

  /** Stops the run in progress. */
  cancel(): Promise<void> {
    return this.summarizer.cancel();
  }

  /** Puts the request for an outside assistant (instructions and transcript) on the clipboard. */
  async copyRequest(meetingId: string, language: string): Promise<boolean> {
    this.startAction();
    try {
      await navigator.clipboard.writeText(await this.port.buildPrompt(meetingId, this.selectedState(), language));
      this.copiedState.set(true);
      return true;
    } catch (error) {
      this.errorState.set(messageOf(error));
      return false;
    } finally {
      this.workingState.set(false);
    }
  }

  /** Splits a report pasted from an outside assistant into the tabs. */
  async importReport(meetingId: string, language: string, text: string): Promise<boolean> {
    this.startAction();
    try {
      this.land(meetingId, language, await this.port.importReport(meetingId, language, text), 'imported');
      return true;
    } catch (error) {
      this.errorState.set(messageOf(error));
      return false;
    } finally {
      this.workingState.set(false);
    }
  }

  /** Forgets the last outcome, error and copy when another meeting opens. */
  reset(): void {
    this.errorState.set(null);
    this.outcomeState.set(null);
    this.copiedState.set(false);
  }

  private startAction(): void {
    this.workingState.set(true);
    this.errorState.set(null);
    this.outcomeState.set(null);
    this.copiedState.set(false);
  }

  /** Puts the saved sections where a normal run would have put them. */
  private land(meetingId: string, language: string, result: CombinedResult, kind: CombinedOutcome['kind']): void {
    const id = toMeetingId(meetingId);
    for (const summary of result.saved) {
      const current = this.store.selectedMeeting();
      if (current && current.id === id) {
        this.store.setSelectedMeeting(withSummary(current, summary));
      }
      this.store.setSummaryCacheResult(id, summary.template, summary.language || language, summary);
    }
    this.outcomeState.set({ kind, saved: result.saved.length, missing: result.missing, ignored: result.ignored });
  }

  private readSelection(): readonly string[] {
    try {
      const stored = this.preferences.get(COMBINED_TEMPLATES_PREFERENCE_KEY);
      return stored ? stored.split(',').filter((name) => name !== '') : [];
    } catch {
      return [];
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
