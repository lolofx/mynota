import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import type { ExportLink } from '../../../core/ports/export-folder.port';

/**
 * Export state of the open meeting (ADR 0022): which Markdown file in the
 * note folder it is linked to, and what to do when the file moved or is gone.
 * Renders nothing while exporting is off or the state is unknown. Dumb view:
 * the shell owns the file picker and the facade calls.
 */
@Component({
  selector: 'app-export-link-strip',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './export-link-strip.component.html',
  styleUrl: './export-link-strip.component.scss',
})
export class ExportLinkStripComponent {
  readonly link = input<ExportLink | null>(null);
  /** True while a link action is in flight; the buttons stay disabled. */
  readonly busy = input(false);
  /** Message of the last failed link action. */
  readonly error = input<string | null>(null);

  readonly relinkRequested = output<void>();
  readonly recreateRequested = output<void>();
  readonly unlinkRequested = output<void>();

  protected readonly visible = computed(() => {
    const state = this.link()?.state;
    return state !== undefined && state !== 'noFolder';
  });
}
