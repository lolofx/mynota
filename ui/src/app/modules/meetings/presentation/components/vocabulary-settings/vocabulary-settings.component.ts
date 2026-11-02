import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { I18n } from '../../../../../i18n/i18n.service';
import { VocabularyFacade } from '../../../application/facades/vocabulary.facade';

/**
 * Settings section for the user's vocabulary: lines like `la F = l'AF` fix
 * what the speech model hears wrong, bare terms are only given to the
 * summaries. Injects its facade optionally: without one, nothing renders.
 */
@Component({
  selector: 'app-vocabulary-settings',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vocabulary-settings.component.html',
  styleUrl: './vocabulary-settings.component.scss',
})
export class VocabularySettingsComponent implements OnInit {
  private readonly i18n = inject(I18n);
  protected readonly facade = inject(VocabularyFacade, { optional: true });

  ngOnInit(): void {
    void this.facade?.load();
  }

  protected onInput(event: Event): void {
    this.facade?.edit((event.target as HTMLTextAreaElement).value);
  }

  protected apply(): void {
    if (window.confirm(this.i18n.t('vocabulary.applyConfirm'))) {
      void this.facade?.applyToMeetings();
    }
  }
}
