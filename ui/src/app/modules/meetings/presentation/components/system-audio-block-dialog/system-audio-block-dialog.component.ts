import { ChangeDetectionStrategy, Component, HostListener, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import type { SystemAudioStatus } from '../../../core/models/capture-source.model';
import type { SystemAudioBlock } from '../../../core/models/system-audio-block.model';

/**
 * Blocking modal shown when a recording that needs system audio cannot
 * capture it. Purely presentational: the owning shell decides when it shows
 * (`block()` is non-null) and wires each output to the guard or the facade.
 * It has no close-on-backdrop and no Escape handling for `lost-during-recording`:
 * the only way out is to stop the recording, so the user cannot miss it.
 */
@Component({
  selector: 'app-system-audio-block-dialog',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './system-audio-block-dialog.component.html',
  styleUrl: './system-audio-block-dialog.component.scss',
})
export class SystemAudioBlockDialogComponent {
  readonly block = input<SystemAudioBlock | null>(null);
  readonly status = input<SystemAudioStatus | undefined>(undefined);

  readonly permissionRequested = output<void>();
  readonly retryRequested = output<void>();
  readonly stopRequested = output<void>();
  readonly dismissRequested = output<void>();

  protected readonly isStartRefused = computed(() => this.block() === 'start-refused');
  protected readonly permissionDenied = computed(() => this.status()?.kind === 'permission_denied');
  protected readonly restartRequired = computed(() => {
    const status = this.status();
    return status?.kind === 'permission_denied' && status.restartRequired;
  });
  protected readonly unavailableReason = computed(() => {
    const status = this.status();
    return status?.kind === 'unavailable' ? status.reason : null;
  });

  /** Escape closes a refused start only: a lost capture must be resolved by stopping. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isStartRefused()) {
      this.dismissRequested.emit();
    }
  }
}
