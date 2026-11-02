import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { I18n } from '../../../../../i18n/i18n.service';
import type { AudioUsage } from '../../../core/ports/audio-purge.port';
import { formatBytes } from '../../utils/format-bytes.util';

/**
 * Audio state of the open meeting (ADR 0022): offers to free the audio once
 * the meeting has a transcript, and says what a purged meeting can no longer
 * do. Renders nothing when there is no audio to free. Dumb view: the shell
 * owns the facade.
 */
@Component({
  selector: 'app-audio-purge-strip',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audio-purge-strip.component.html',
  styleUrl: './audio-purge-strip.component.scss',
})
export class AudioPurgeStripComponent {
  private readonly i18n = inject(I18n);

  readonly usage = input<AudioUsage | null>(null);
  readonly working = input(false);
  readonly error = input<string | null>(null);

  readonly purgeRequested = output<void>();

  protected readonly size = computed(() => formatBytes(this.usage()?.bytes ?? 0));
  protected readonly visible = computed(() => {
    const usage = this.usage();
    return usage !== null && (usage.purged || usage.canPurge);
  });

  protected purge(): void {
    if (window.confirm(this.i18n.t('audioPurge.confirm', { size: this.size() }))) {
      this.purgeRequested.emit();
    }
  }
}
