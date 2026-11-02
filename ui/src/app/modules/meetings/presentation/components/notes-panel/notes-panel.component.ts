import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { renderMarkdown } from '../summary-panel/markdown-render.util';

/** `hh:mm:ss` for a whole number of seconds, the stamp the export uses. */
export function stampOf(totalSec: number): string {
  const total = Math.max(0, Math.floor(totalSec));
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/**
 * The user's own notes on the open meeting (ADR 0022): a quick-note line that
 * stamps the elapsed time of the recording or of the playback, and the whole
 * notes text below it. Collapsed to one line until opened. Dumb view: the
 * shell owns the facade.
 */
@Component({
  selector: 'app-notes-panel',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notes-panel.component.html',
  styleUrl: './notes-panel.component.scss',
})
export class NotesPanelComponent {
  readonly text = input('');
  /** Seconds to stamp the next quick note with, or `null` for an unstamped note. */
  readonly clockSec = input<number | null>(null);
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly textChanged = output<string>();
  readonly noteAdded = output<string>();

  protected readonly open = signal(false);
  protected readonly preview = signal(false);
  protected readonly draft = signal('');
  protected readonly rendered = computed(() => (this.preview() ? renderMarkdown(this.text()) : ''));
  protected readonly stamp = computed(() => {
    const at = this.clockSec();
    return at === null ? null : stampOf(at);
  });

  protected toggle(): void {
    this.open.update((value) => !value);
  }

  protected setPreview(preview: boolean): void {
    this.preview.set(preview);
  }

  protected onDraft(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected add(): void {
    const note = this.draft().trim();
    if (note === '') {
      return;
    }
    this.noteAdded.emit(note);
    this.draft.set('');
  }

  protected onText(event: Event): void {
    this.textChanged.emit((event.target as HTMLTextAreaElement).value);
  }
}
