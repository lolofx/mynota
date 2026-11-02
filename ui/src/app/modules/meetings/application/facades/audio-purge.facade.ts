import { Injectable, inject, signal } from '@angular/core';

import type { AudioUsage, PurgeSummary } from '../../core/ports/audio-purge.port';
import { AudioPurgePort } from '../../core/ports/audio-purge.port';

/**
 * Freeing the audio of meetings (ADR 0022): the open meeting's audio state
 * and the bulk purge of old audio. Never optimistic: state changes only
 * after the backend confirmed. Provided at the route injector, never
 * `providedIn: 'root'`.
 */
@Injectable()
export class AudioPurgeFacade {
  private readonly port = inject(AudioPurgePort);

  private readonly usageState = signal<AudioUsage | null>(null);
  private readonly previewState = signal<PurgeSummary | null>(null);
  private readonly doneState = signal<PurgeSummary | null>(null);
  private readonly errorState = signal<string | null>(null);
  private readonly workingState = signal(false);
  private usageRequest = 0;

  /** Audio state of the meeting on screen; `null` while unknown. */
  readonly usage = this.usageState.asReadonly();
  /** What the bulk purge would remove, once asked. */
  readonly preview = this.previewState.asReadonly();
  /** What the last purge freed. */
  readonly done = this.doneState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly working = this.workingState.asReadonly();

  async refreshUsage(meetingId: string | null): Promise<void> {
    const request = ++this.usageRequest;
    if (meetingId === null) {
      this.usageState.set(null);
      return;
    }
    try {
      const usage = await this.port.usage(meetingId);
      if (request === this.usageRequest) {
        this.usageState.set(usage);
      }
    } catch {
      if (request === this.usageRequest) {
        this.usageState.set(null);
      }
    }
  }

  /** Removes the audio of `meetingId`; resolves `true` when it was removed. */
  async purge(meetingId: string): Promise<boolean> {
    const ok = await this.run(async () => {
      this.doneState.set(await this.port.purge(meetingId));
    });
    await this.refreshUsage(meetingId);
    return ok;
  }

  async loadPreview(olderThanDays: number): Promise<void> {
    this.doneState.set(null);
    await this.run(async () => {
      this.previewState.set(await this.port.preview(olderThanDays));
    });
  }

  /** Purges the audio older than `olderThanDays` days, then re-reads the preview. */
  async purgeOlderThan(olderThanDays: number): Promise<void> {
    await this.run(async () => {
      this.doneState.set(await this.port.purgeOlderThan(olderThanDays));
      this.previewState.set(await this.port.preview(olderThanDays));
    });
  }

  private async run(action: () => Promise<void>): Promise<boolean> {
    this.workingState.set(true);
    this.errorState.set(null);
    try {
      await action();
      return true;
    } catch (error) {
      this.errorState.set(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      this.workingState.set(false);
    }
  }
}
