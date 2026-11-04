import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { AppInfoPort } from '../../core/ports/app-info.port';
import { FileDialogPort } from '../../core/ports/file-dialog.port';
import { MeetingRepositoryPort } from '../../core/ports/meeting-repository.port';
import { ModelsStatusPort } from '../../core/ports/models-status.port';
import { PreferencesPort } from '../../core/ports/preferences.port';
import { RecorderPort } from '../../core/ports/recorder.port';
import { SummarizerPort } from '../../core/ports/summarizer.port';
import { TemplateRepositoryPort } from '../../core/ports/template-repository.port';
import { TranscriberPort } from '../../core/ports/transcriber.port';
import { provideMeetings } from '../../meetings.providers';
import { InMemoryAppInfoFake } from '../testing/in-memory-app-info.fake';
import { InMemoryFileDialogFake } from '../testing/in-memory-file-dialog.fake';
import { InMemoryMeetingRepositoryFake } from '../testing/in-memory-meeting-repository.fake';
import { InMemoryModelsStatusFake } from '../testing/in-memory-models-status.fake';
import { InMemoryPreferencesFake } from '../testing/in-memory-preferences.fake';
import { InMemoryRecorderFake } from '../testing/in-memory-recorder.fake';
import { InMemorySummarizerFake } from '../testing/in-memory-summarizer.fake';
import { InMemoryTemplateRepositoryFake } from '../testing/in-memory-template-repository.fake';
import { InMemoryTranscriberFake } from '../testing/in-memory-transcriber.fake';
import { MeetingsFacade } from './meetings.facade';

/** The language and remote speaker count announced for a recording reach the recorder, once. */
describe('MeetingsFacade recording hints', () => {
  const configure = (preferences?: InMemoryPreferencesFake): void => {
    TestBed.configureTestingModule({
      providers: [
        provideMeetings(),
        { provide: MeetingRepositoryPort, useClass: InMemoryMeetingRepositoryFake },
        { provide: RecorderPort, useClass: InMemoryRecorderFake },
        { provide: SummarizerPort, useClass: InMemorySummarizerFake },
        { provide: TranscriberPort, useClass: InMemoryTranscriberFake },
        { provide: TemplateRepositoryPort, useClass: InMemoryTemplateRepositoryFake },
        { provide: ModelsStatusPort, useClass: InMemoryModelsStatusFake },
        { provide: FileDialogPort, useClass: InMemoryFileDialogFake },
        { provide: AppInfoPort, useClass: InMemoryAppInfoFake },
        { provide: PreferencesPort, useValue: preferences ?? new InMemoryPreferencesFake() },
      ],
    });
  };

  it('starts with no hints when nothing was said', async () => {
    configure();
    const facade = TestBed.inject(MeetingsFacade);

    await facade.startRecording('Weekly');

    expect((TestBed.inject(RecorderPort) as InMemoryRecorderFake).getLastRequestedHints()).toEqual({
      language: 'auto',
      speakers: null,
    });
  });

  it('sends the default language, then lets a launch-time pick and a speaker count apply to one recording', async () => {
    configure();
    const facade = TestBed.inject(MeetingsFacade);
    const recorder = TestBed.inject(RecorderPort) as InMemoryRecorderFake;
    facade.recordingHints.setDefaultLanguage('fr');

    facade.recordingHints.setLanguage('en');
    facade.recordingHints.setSpeakers(4);
    await facade.startRecording('Standup');
    expect(recorder.getLastRequestedHints()).toEqual({ language: 'en', speakers: 4 });

    expect(facade.recordingHints.current()).toEqual({ language: 'fr', speakers: null });
  });

  it('keeps the launch-time choices when the recording fails to start', async () => {
    configure();
    const facade = TestBed.inject(MeetingsFacade);
    const recorder = TestBed.inject(RecorderPort) as InMemoryRecorderFake;
    vi.spyOn(recorder, 'start').mockRejectedValueOnce(new Error('no device'));
    facade.recordingHints.setLanguage('de');
    facade.recordingHints.setSpeakers(2);

    await facade.startRecording('Retry');

    expect(facade.recordingHints.current()).toEqual({ language: 'de', speakers: 2 });
  });
});
