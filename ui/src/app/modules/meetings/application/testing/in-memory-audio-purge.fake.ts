import { Injectable } from '@angular/core';

import type { AudioUsage, PurgeSummary } from '../../core/ports/audio-purge.port';
import { AudioPurgePort } from '../../core/ports/audio-purge.port';

/** In-memory AudioPurgePort implementation for specs. */
@Injectable()
export class InMemoryAudioPurgeFake extends AudioPurgePort {
  readonly usages = new Map<string, AudioUsage>();
  /** What `preview` and `purgeOlderThan` report. */
  candidates: PurgeSummary = { count: 0, bytes: 0 };
  /** Calls made, as `command:argument`, in order. */
  readonly calls: string[] = [];
  /** When set, `purge` rejects with this message. */
  failPurgeWith: string | null = null;

  override async usage(meetingId: string): Promise<AudioUsage> {
    return this.usages.get(meetingId) ?? { bytes: 0, purged: false, canPurge: false };
  }

  override async purge(meetingId: string): Promise<PurgeSummary> {
    this.calls.push(`purge:${meetingId}`);
    if (this.failPurgeWith !== null) {
      throw new Error(this.failPurgeWith);
    }
    const before = await this.usage(meetingId);
    this.usages.set(meetingId, { bytes: 0, purged: true, canPurge: false });
    return { count: 1, bytes: before.bytes };
  }

  override async preview(olderThanDays: number): Promise<PurgeSummary> {
    this.calls.push(`preview:${olderThanDays}`);
    return this.candidates;
  }

  override async purgeOlderThan(olderThanDays: number): Promise<PurgeSummary> {
    this.calls.push(`purgeOlderThan:${olderThanDays}`);
    const done = this.candidates;
    this.candidates = { count: 0, bytes: 0 };
    return done;
  }
}
