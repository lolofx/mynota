import { Injectable } from '@angular/core';

import type { AudioUsage, PurgeSummary } from '../../core/ports/audio-purge.port';
import { AudioPurgePort } from '../../core/ports/audio-purge.port';
import { invokeCommand } from './ipc';

/** `AudioPurgePort` backed by the Tauri IPC command surface. */
@Injectable()
export class TauriAudioPurgeAdapter extends AudioPurgePort {
  override async usage(meetingId: string): Promise<AudioUsage> {
    return invokeCommand('get_audio_usage', { meetingId });
  }

  override async purge(meetingId: string): Promise<PurgeSummary> {
    const result = await invokeCommand('purge_meeting_audio', { meetingId });
    return { count: result.count, bytes: result.freedBytes };
  }

  override async preview(olderThanDays: number): Promise<PurgeSummary> {
    return invokeCommand('preview_audio_purge', { olderThanDays });
  }

  override async purgeOlderThan(olderThanDays: number): Promise<PurgeSummary> {
    const result = await invokeCommand('purge_old_audio', { olderThanDays });
    return { count: result.count, bytes: result.freedBytes };
  }
}
