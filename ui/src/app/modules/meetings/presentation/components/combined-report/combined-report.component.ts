import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import type { CombinedOutcome } from '../../../application/facades/combined-report.facade';

/** A summary tab the report can fill. */
export interface CombinedTemplateOption {
  readonly name: string;
  readonly label: string;
}

/**
 * One report for several summary tabs (ADR 0024): tick the tabs, then either
 * let the model fill them all from one reading of the transcript, or take the
 * request to an outside assistant and import its answer. Collapsed to one
 * line until opened. Dumb view: the shell owns the facade.
 */
@Component({
  selector: 'app-combined-report',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './combined-report.component.html',
  styleUrl: './combined-report.component.scss',
})
export class CombinedReportComponent {
  readonly templates = input<readonly CombinedTemplateOption[]>([]);
  readonly selected = input<readonly string[]>([]);
  readonly working = input(false);
  readonly error = input<string | null>(null);
  readonly outcome = input<CombinedOutcome | null>(null);
  readonly requestCopied = input(false);

  readonly toggled = output<{ readonly name: string; readonly checked: boolean }>();
  readonly generateRequested = output<void>();
  readonly cancelRequested = output<void>();
  readonly copyRequested = output<void>();
  readonly importRequested = output<string>();

  protected readonly open = signal(false);
  protected readonly importing = signal(false);
  protected readonly text = signal('');
  protected readonly canRun = computed(() => this.selected().length > 0 && !this.working());
  protected readonly canImport = computed(() => this.text().trim() !== '' && !this.working());

  protected toggle(): void {
    this.open.update((value) => !value);
  }

  protected isSelected(name: string): boolean {
    return this.selected().includes(name);
  }

  protected onCheck(name: string, event: Event): void {
    this.toggled.emit({ name, checked: (event.target as HTMLInputElement).checked });
  }

  protected startImport(): void {
    this.importing.set(true);
  }

  protected cancelImport(): void {
    this.importing.set(false);
    this.text.set('');
  }

  protected onText(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }

  protected submitImport(): void {
    if (!this.canImport()) {
      return;
    }
    this.importRequested.emit(this.text());
    this.cancelImport();
  }
}
