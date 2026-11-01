import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { I18n } from '../../../../../i18n/i18n.service';
import { AudioPurgeFacade } from '../../../application/facades/audio-purge.facade';
import { formatBytes } from '../../utils/format-bytes.util';

/** Ages offered for the bulk purge, in days. */
export const PURGE_AGES_DAYS = [30, 90, 180, 365] as const;

/**
 * Settings section that frees the audio of old meetings in one go (ADR 0022).
 * Shows how many meetings and how much disk a purge would free before asking
 * to confirm. Injects its facade optionally: without one, nothing renders.
 */
@Component({
  selector: 'app-audio-purge-settings',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audio-purge-settings.component.html',
})
export class AudioPurgeSettingsComponent implements OnInit {
  private readonly i18n = inject(I18n);
  protected readonly facade = inject(AudioPurgeFacade, { optional: true });

  protected readonly ages = PURGE_AGES_DAYS;
  protected readonly days = signal<number>(90);
  protected readonly previewSize = computed(() => formatBytes(this.facade?.preview()?.bytes ?? 0));
  protected readonly doneSize = computed(() => formatBytes(this.facade?.done()?.bytes ?? 0));

  ngOnInit(): void {
    void this.facade?.loadPreview(this.days());
  }

  protected onDays(event: Event): void {
    this.days.set(Number((event.target as HTMLSelectElement).value));
    void this.facade?.loadPreview(this.days());
  }

  protected purge(): void {
    const preview = this.facade?.preview();
    if (!preview || preview.count === 0) {
      return;
    }
    if (window.confirm(this.i18n.t('audioPurge.bulkConfirm', { count: preview.count, size: this.previewSize() }))) {
      void this.facade?.purgeOlderThan(this.days());
    }
  }
}
