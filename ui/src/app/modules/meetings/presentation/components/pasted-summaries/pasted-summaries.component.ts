import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import type { ExternalSummary } from '../../../core/models/external-summary.model';
import { renderMarkdown } from '../summary-panel/markdown-render.util';

/** A summary to keep, as typed in the paste form. */
export interface PastedSummaryDraft {
  readonly label: string;
  readonly markdown: string;
}

/**
 * Summaries pasted from outside the app (ADR 0022), each under the label the
 * user chose. Collapsed to one line until opened; a paste form adds more.
 * Dumb view: the shell owns the facade.
 */
@Component({
  selector: 'app-pasted-summaries',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pasted-summaries.component.html',
  styleUrl: './pasted-summaries.component.scss',
})
export class PastedSummariesComponent {
  readonly items = input<readonly ExternalSummary[]>([]);
  readonly working = input(false);
  readonly error = input<string | null>(null);
  /** The prompt was just copied. */
  readonly promptCopied = input(false);

  readonly added = output<PastedSummaryDraft>();
  readonly removed = output<number>();
  /** The user wants the prompt with the transcript, to give to an outside assistant. */
  readonly promptRequested = output<void>();

  protected readonly open = signal(false);
  protected readonly pasting = signal(false);
  protected readonly label = signal('');
  protected readonly markdown = signal('');
  protected readonly canSave = computed(() => this.markdown().trim() !== '' && !this.working());
  protected readonly rendered = computed(() => this.items().map((item) => ({ item, html: renderMarkdown(item.markdown) })));

  protected toggle(): void {
    this.open.update((value) => !value);
  }

  protected startPaste(): void {
    this.pasting.set(true);
  }

  protected cancelPaste(): void {
    this.pasting.set(false);
    this.label.set('');
    this.markdown.set('');
  }

  protected save(): void {
    if (!this.canSave()) {
      return;
    }
    this.added.emit({ label: this.label().trim(), markdown: this.markdown() });
    this.cancelPaste();
  }

  protected remove(item: ExternalSummary): void {
    if (window.confirm(item.label)) {
      this.removed.emit(item.id);
    }
  }

  protected onLabel(event: Event): void {
    this.label.set((event.target as HTMLInputElement).value);
  }

  protected onMarkdown(event: Event): void {
    this.markdown.set((event.target as HTMLTextAreaElement).value);
  }
}
