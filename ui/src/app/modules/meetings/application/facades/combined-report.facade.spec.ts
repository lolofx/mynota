import { TestBed } from '@angular/core/testing';

import { toMeetingId } from '../../core/models/meeting.model';
import { AudioImportPort } from '../../core/ports/audio-import.port';
import { CombinedReportPort } from '../../core/ports/combined-report.port';
import { PreferencesPort } from '../../core/ports/preferences.port';
import { RecorderPort } from '../../core/ports/recorder.port';
import { SummarizerPort } from '../../core/ports/summarizer.port';
import { TranscriberPort } from '../../core/ports/transcriber.port';
import { InMemoryAudioImportFake } from '../testing/in-memory-audio-import.fake';
import { InMemoryCombinedReportFake } from '../testing/in-memory-combined-report.fake';
import { InMemoryPreferencesFake } from '../testing/in-memory-preferences.fake';
import { InMemoryRecorderFake } from '../testing/in-memory-recorder.fake';
import { InMemorySummarizerFake } from '../testing/in-memory-summarizer.fake';
import { InMemoryTranscriberFake } from '../testing/in-memory-transcriber.fake';
import { MeetingsStore } from '../stores/meetings.store';
import { COMBINED_TEMPLATES_PREFERENCE_KEY, CombinedReportFacade } from './combined-report.facade';

describe('CombinedReportFacade', () => {
  let facade: CombinedReportFacade;
  let fake: InMemoryCombinedReportFake;
  let store: MeetingsStore;
  let preferences: InMemoryPreferencesFake;
  let written: string[];

  const configure = (): void => {
    TestBed.configureTestingModule({
      providers: [
        MeetingsStore,
        CombinedReportFacade,
        InMemoryRecorderFake,
        { provide: RecorderPort, useExisting: InMemoryRecorderFake },
        InMemoryTranscriberFake,
        { provide: TranscriberPort, useExisting: InMemoryTranscriberFake },
        { provide: SummarizerPort, useClass: InMemorySummarizerFake },
        InMemoryAudioImportFake,
        { provide: AudioImportPort, useExisting: InMemoryAudioImportFake },
        { provide: PreferencesPort, useValue: preferences },
        { provide: CombinedReportPort, useClass: InMemoryCombinedReportFake },
      ],
    });
    facade = TestBed.inject(CombinedReportFacade);
    fake = TestBed.inject(CombinedReportPort) as InMemoryCombinedReportFake;
    store = TestBed.inject(MeetingsStore);
  };

  beforeEach(() => {
    preferences = new InMemoryPreferencesFake();
    written = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void written.push(text) },
    });
  });

  it('remembers the ticked tabs and restores them in a new facade', () => {
    configure();
    facade.toggle('key-points', true);
    facade.toggle('decisions', true);
    facade.toggle('key-points', false);

    expect(facade.selected()).toEqual(['decisions']);
    expect(preferences.get(COMBINED_TEMPLATES_PREFERENCE_KEY)).toBe('decisions');
    TestBed.resetTestingModule();
    configure();
    expect(facade.selected()).toEqual(['decisions']);
  });

  it('generates the ticked tabs in one call and caches each result', async () => {
    configure();
    facade.toggle('key-points', true);
    facade.toggle('decisions', true);

    const done = await facade.generate('m-1', 'fr');

    expect(done).toBe(true);
    expect(fake.generated).toEqual([{ meetingId: 'm-1', templates: ['key-points', 'decisions'], language: 'fr' }]);
    const id = toMeetingId('m-1');
    expect(store.getSummaryCacheEntry(id, 'key-points', 'fr')?.summary?.markdown).toBe('generated key-points');
    expect(store.getSummaryCacheEntry(id, 'decisions', 'fr')?.summary?.markdown).toBe('generated decisions');
    expect(facade.outcome()).toEqual({ kind: 'generated', saved: 2, missing: [], ignored: [] });
  });

  it('marks the store as generating during the run and clears it after', async () => {
    configure();
    facade.toggle('key-points', true);

    const run = facade.generate('m-1', 'fr');
    expect(store.summarizingKey()).toEqual({ template: 'combined', language: 'fr' });
    expect(facade.working()).toBe(true);
    await run;

    expect(store.summarizingKey()).toBeNull();
    expect(facade.working()).toBe(false);
  });

  it('reports the tabs the report left out', async () => {
    configure();
    fake.skip = ['decisions'];
    facade.toggle('key-points', true);
    facade.toggle('decisions', true);

    await facade.generate('m-1', 'fr');

    expect(facade.outcome()?.missing).toEqual(['decisions']);
  });

  it('shows a failure and stays usable, but not a cancellation', async () => {
    configure();
    facade.toggle('key-points', true);
    fake.failWith = 'model missing';
    expect(await facade.generate('m-1', 'fr')).toBe(false);
    expect(facade.error()).toBe('model missing');

    fake.failWith = 'LLM error: cancelled';
    await facade.generate('m-1', 'fr');
    expect(facade.error()).toBeNull();
    expect(store.summarizingKey()).toBeNull();
  });

  it('copies one text with the instructions of the ticked tabs and the transcript', async () => {
    configure();
    facade.toggle('key-points', true);

    expect(await facade.copyRequest('m-1', 'fr')).toBe(true);

    expect(written).toEqual(['PROMPT m-1 key-points fr']);
    expect(facade.requestCopied()).toBe(true);
  });

  it('imports a pasted report into the tabs it names', async () => {
    configure();

    await facade.importReport('m-1', 'fr', '### SECTION: decisions\n- d\n### SECTION: key-points\n- k');

    const id = toMeetingId('m-1');
    expect(store.getSummaryCacheEntry(id, 'decisions', 'fr')?.summary?.markdown).toBe('imported decisions');
    expect(facade.outcome()?.kind).toBe('imported');
    expect(facade.outcome()?.saved).toBe(2);
  });

  it('forgets the last outcome when another meeting opens', async () => {
    configure();
    facade.toggle('key-points', true);
    await facade.generate('m-1', 'fr');

    facade.reset();

    expect(facade.outcome()).toBeNull();
    expect(facade.error()).toBeNull();
  });
});
