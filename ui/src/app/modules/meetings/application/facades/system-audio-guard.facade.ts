import { Injectable, effect, inject, signal } from '@angular/core';

import type { CaptureSource, SystemAudioStatus } from '../../core/models/capture-source.model';
import type { SystemAudioBlock } from '../../core/models/system-audio-block.model';
import { MeetingsStore } from '../stores/meetings.store';
import { CheckSystemAudioUseCase } from '../use-cases/check-system-audio.usecase';

/**
 * How long a recording may run without a system-audio source before the
 * missing track is treated as a failure. The backend announces the resolved
 * source asynchronously, so a null right after start is not yet a failure.
 */
export const SYSTEM_AUDIO_GRACE_MS = 5_000;

/** Pure: a source that captures the meeting's remote side needs system audio. */
export function systemAudioRequired(source: CaptureSource): boolean {
  return source !== 'microphone';
}

/** Pure: a status that means the system tap cannot run at all. */
export function systemAudioUnavailable(status: SystemAudioStatus | undefined): boolean {
  return status?.kind === 'permission_denied' || status?.kind === 'unavailable';
}

/**
 * Blocks a recording that needs system audio when that audio cannot be
 * captured. Capturing the microphone alone would silently produce an
 * incomplete meeting, so the rule is: never start without system audio, and
 * stop (through the dialog) if it disappears mid-recording.
 */
@Injectable()
export class SystemAudioGuardFacade {
  private readonly store = inject(MeetingsStore);
  private readonly checkSystemAudioUseCase = inject(CheckSystemAudioUseCase);

  private readonly blockState = signal<SystemAudioBlock | null>(null);
  /** The blocking reason to show, or `null` when nothing blocks. */
  readonly block = this.blockState.asReadonly();
  readonly status = this.store.systemAudioStatus;

  constructor() {
    effect((onCleanup) => {
      if (this.store.recordingState() !== 'recording') {
        this.blockState.update((current) => (current === 'lost-during-recording' ? null : current));
        return;
      }
      if (!systemAudioRequired(this.store.captureSource()) || this.store.effectiveSystemSource() !== null) {
        this.blockState.update((current) => (current === 'lost-during-recording' ? null : current));
        return;
      }
      const timer = setTimeout(() => this.blockState.set('lost-during-recording'), SYSTEM_AUDIO_GRACE_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  /**
   * Checks the system-audio status right before a start. Returns `false`
   * and shows the blocking dialog when the recording must not start. A
   * failed check lets the start proceed: the mid-recording check still covers it.
   */
  async allowStart(): Promise<boolean> {
    if (!systemAudioRequired(this.store.captureSource())) {
      this.blockState.set(null);
      return true;
    }
    let status: SystemAudioStatus;
    try {
      status = await this.checkSystemAudioUseCase.status();
    } catch {
      return true;
    }
    this.store.setSystemAudioStatus(status);
    if (systemAudioUnavailable(status)) {
      this.blockState.set('start-refused');
      return false;
    }
    this.blockState.set(null);
    return true;
  }

  /** Runs `start` only when system audio is available; otherwise the blocking dialog takes over. */
  async startGuarded(start: () => Promise<void>): Promise<void> {
    if (await this.allowStart()) {
      await start();
    }
  }

  /** Closes a `start-refused` dialog. A lost-capture block clears itself once the recording stops. */
  dismiss(): void {
    this.blockState.set(null);
  }
}
