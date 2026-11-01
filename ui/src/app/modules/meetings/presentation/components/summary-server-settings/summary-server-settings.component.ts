import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { I18n } from '../../../../../i18n/i18n.service';
import { EMPTY_SUMMARY_SERVER } from '../../../core/models/summary-server.model';
import type { SummaryServer } from '../../../core/models/summary-server.model';
import { SummaryServerPort } from '../../../core/ports/summary-server.port';

type Status = 'idle' | 'testing' | 'saving';

/**
 * Optional summary server on the user's own network (ADR 0021): address,
 * model picked from what the server offers, and an on/off switch. Talks to
 * the port directly because it owns nothing the meetings facade needs. The
 * section renders nothing when the port is not provided.
 */
@Component({
  selector: 'app-summary-server-settings',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './summary-server-settings.component.html',
  styleUrl: './summary-server-settings.component.scss',
})
export class SummaryServerSettingsComponent implements OnInit {
  private readonly port = inject(SummaryServerPort, { optional: true });
  private readonly i18n = inject(I18n);

  protected readonly available = this.port !== null;
  protected readonly url = signal('');
  protected readonly model = signal('');
  protected readonly enabled = signal(false);
  protected readonly serverModels = signal<readonly string[]>([]);
  protected readonly status = signal<Status>('idle');
  protected readonly message = signal<{ readonly kind: 'ok' | 'error'; readonly text: string } | null>(null);

  /** The saved model stays selectable even before the server has been contacted. */
  protected readonly modelChoices = computed(() => {
    const current = this.model();
    const listed = this.serverModels();
    return current !== '' && !listed.includes(current) ? [current, ...listed] : listed;
  });
  protected readonly busy = computed(() => this.status() !== 'idle');
  protected readonly canTest = computed(() => this.url().trim() !== '' && !this.busy());

  async ngOnInit(): Promise<void> {
    if (this.port === null) {
      return;
    }
    try {
      this.apply(await this.port.get());
    } catch {
      this.apply(EMPTY_SUMMARY_SERVER);
    }
  }

  protected onUrlInput(event: Event): void {
    this.url.set((event.target as HTMLInputElement).value);
    this.serverModels.set([]);
    this.message.set(null);
  }

  protected onModelChange(event: Event): void {
    this.model.set((event.target as HTMLSelectElement).value);
    this.message.set(null);
  }

  protected onEnabledChange(event: Event): void {
    this.enabled.set((event.target as HTMLInputElement).checked);
    this.message.set(null);
  }

  /** Contacts the server: proves the address works and fills the model list. */
  protected async testConnection(): Promise<void> {
    if (this.port === null || !this.canTest()) {
      return;
    }
    this.status.set('testing');
    this.message.set(null);
    try {
      const names = await this.port.listModels(this.url().trim());
      this.serverModels.set(names);
      if (names.length === 0) {
        this.message.set({ kind: 'error', text: this.i18n.t('settings.summaryServer.noModels') });
      } else {
        if (this.model() === '' || !names.includes(this.model())) {
          this.model.set(names[0] ?? '');
        }
        this.message.set({
          kind: 'ok',
          text: this.i18n.t('settings.summaryServer.connected', { count: names.length }),
        });
      }
    } catch (error) {
      this.message.set({ kind: 'error', text: errorText(error) });
    } finally {
      this.status.set('idle');
    }
  }

  protected async save(): Promise<void> {
    if (this.port === null || this.busy()) {
      return;
    }
    this.status.set('saving');
    this.message.set(null);
    try {
      await this.port.save({ url: this.url().trim(), model: this.model().trim(), enabled: this.enabled() });
      this.message.set({ kind: 'ok', text: this.i18n.t('settings.summaryServer.saved') });
    } catch (error) {
      this.message.set({ kind: 'error', text: errorText(error) });
    } finally {
      this.status.set('idle');
    }
  }

  private apply(server: SummaryServer): void {
    this.url.set(server.url);
    this.model.set(server.model);
    this.enabled.set(server.enabled);
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
