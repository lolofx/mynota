import { Injectable, inject, signal } from '@angular/core';

import type { ExternalSummary } from '../../core/models/external-summary.model';
import { ExternalSummariesPort } from '../../core/ports/external-summaries.port';

/**
 * Summaries pasted for the open meeting (ADR 0022). Never optimistic: the
 * list changes only once the backend has kept the text. Provided at the
 * route injector, never `providedIn: 'root'`.
 */
@Injectable()
export class ExternalSummariesFacade {
  private readonly port = inject(ExternalSummariesPort);

  private readonly itemsState = signal<readonly ExternalSummary[]>([]);
  private readonly errorState = signal<string | null>(null);
  private readonly workingState = signal(false);
  private meetingId: string | null = null;
  private request = 0;

  readonly items = this.itemsState.asReadonly();
  /** Message of the last failed action; `null` once the next one starts. */
  readonly error = this.errorState.asReadonly();
  readonly working = this.workingState.asReadonly();

  /** Shows the pasted summaries of `meetingId`; `null`: no meeting. */
  async load(meetingId: string | null): Promise<void> {
    const request = ++this.request;
    this.meetingId = meetingId;
    this.errorState.set(null);
    this.itemsState.set([]);
    if (meetingId === null) {
      return;
    }
    try {
      const items = await this.port.list(meetingId);
      if (request === this.request) {
        this.itemsState.set(items);
      }
    } catch (error) {
      if (request === this.request) {
        this.errorState.set(messageOf(error));
      }
    }
  }

  /** Keeps `markdown` with the meeting under `label`. Resolves `true` when it was kept. */
  add(label: string, markdown: string): Promise<boolean> {
    return this.run((id) => this.port.add(id, label, markdown));
  }

  remove(summaryId: number): Promise<boolean> {
    return this.run((id) => this.port.remove(id, summaryId));
  }

  private async run(action: (meetingId: string) => Promise<readonly ExternalSummary[]>): Promise<boolean> {
    const id = this.meetingId;
    if (id === null) {
      return false;
    }
    this.workingState.set(true);
    this.errorState.set(null);
    try {
      const items = await action(id);
      if (id === this.meetingId) {
        this.itemsState.set(items);
      }
      return true;
    } catch (error) {
      this.errorState.set(messageOf(error));
      return false;
    } finally {
      this.workingState.set(false);
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
