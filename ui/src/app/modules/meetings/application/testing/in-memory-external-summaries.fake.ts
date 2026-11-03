import { Injectable } from '@angular/core';

import type { ExternalSummary } from '../../core/models/external-summary.model';
import { ExternalSummariesPort } from '../../core/ports/external-summaries.port';

/** In-memory ExternalSummariesPort implementation for specs. */
@Injectable()
export class InMemoryExternalSummariesFake extends ExternalSummariesPort {
  readonly byMeeting = new Map<string, ExternalSummary[]>();
  /** When set, `add` rejects with this message. */
  failAddWith: string | null = null;

  override async list(meetingId: string): Promise<readonly ExternalSummary[]> {
    return [...(this.byMeeting.get(meetingId) ?? [])];
  }

  override async add(meetingId: string, label: string, markdown: string): Promise<readonly ExternalSummary[]> {
    if (this.failAddWith !== null) {
      throw new Error(this.failAddWith);
    }
    const all = this.byMeeting.get(meetingId) ?? [];
    const id = Math.max(0, ...all.map((s) => s.id)) + 1;
    this.byMeeting.set(meetingId, [...all, { id, label: label.trim() || 'External', markdown, createdAt: new Date(0) }]);
    return this.list(meetingId);
  }

  /** What `buildPrompt` resolves; a function so specs can see its arguments. */
  prompt = (meetingId: string, template: string, language: string): string => `PROMPT ${meetingId} ${template} ${language}`;

  override async buildPrompt(meetingId: string, template: string, language: string): Promise<string> {
    return this.prompt(meetingId, template, language);
  }

  override async remove(meetingId: string, summaryId: number): Promise<readonly ExternalSummary[]> {
    this.byMeeting.set(
      meetingId,
      (this.byMeeting.get(meetingId) ?? []).filter((s) => s.id !== summaryId),
    );
    return this.list(meetingId);
  }
}
