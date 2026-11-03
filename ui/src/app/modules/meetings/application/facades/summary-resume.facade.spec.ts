import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { toMeetingId } from '../../core/models/meeting.model';
import { AudioImportPort } from '../../core/ports/audio-import.port';
import { PreferencesPort } from '../../core/ports/preferences.port';
import { RecorderPort } from '../../core/ports/recorder.port';
import { SummarizerPort } from '../../core/ports/summarizer.port';
import { TranscriberPort } from '../../core/ports/transcriber.port';
import { InMemoryAudioImportFake } from '../testing/in-memory-audio-import.fake';
import { InMemoryPreferencesFake } from '../testing/in-memory-preferences.fake';
import { InMemoryRecorderFake } from '../testing/in-memory-recorder.fake';
import { InMemorySummarizerFake } from '../testing/in-memory-summarizer.fake';
import { InMemoryTranscriberFake } from '../testing/in-memory-transcriber.fake';
import { MeetingsStore } from '../stores/meetings.store';
import { SUMMARY_RESUME_POLL_MS, SummaryResumeFacade } from './summary-resume.facade';

const ACTIVE = { meetingId: 'm-1', template: 'key-points', language: 'fr' };

describe('SummaryResumeFacade', () => {
  let facade: SummaryResumeFacade;
  let store: MeetingsStore;
  let summarizer: InMemorySummarizerFake;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        MeetingsStore,
        SummaryResumeFacade,
        InMemoryRecorderFake,
        { provide: RecorderPort, useExisting: InMemoryRecorderFake },
        InMemoryTranscriberFake,
        { provide: TranscriberPort, useExisting: InMemoryTranscriberFake },
        { provide: SummarizerPort, useClass: InMemorySummarizerFake },
        InMemoryAudioImportFake,
        { provide: AudioImportPort, useExisting: InMemoryAudioImportFake },
        { provide: PreferencesPort, useClass: InMemoryPreferencesFake },
      ],
    });
    facade = TestBed.inject(SummaryResumeFacade);
    store = TestBed.inject(MeetingsStore);
    summarizer = TestBed.inject(SummarizerPort) as InMemorySummarizerFake;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when no summary is running', async () => {
    await facade.resume();

    expect(store.summarizingKey()).toBeNull();
  });

  it('marks the running template as generating until the backend is done, then clears it', async () => {
    summarizer.setActiveSummarization(ACTIVE);

    const resumed = facade.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.summarizingKey()).toEqual({ template: 'key-points', language: 'fr' });

    await vi.advanceTimersByTimeAsync(SUMMARY_RESUME_POLL_MS);
    expect(store.summarizingKey()).toEqual({ template: 'key-points', language: 'fr' });

    summarizer.setActiveSummarization(null);
    await vi.advanceTimersByTimeAsync(SUMMARY_RESUME_POLL_MS);
    await resumed;

    expect(store.summarizingKey()).toBeNull();
  });

  it('puts the saved result in the summary cache once the run is over', async () => {
    const id = toMeetingId('m-1');
    summarizer.seedSummary(id, { template: 'key-points', language: 'fr', markdown: '- point un', createdAt: new Date(), stale: false });
    summarizer.setActiveSummarization(ACTIVE);

    const resumed = facade.resume();
    await vi.advanceTimersByTimeAsync(0);
    summarizer.setActiveSummarization(null);
    await vi.advanceTimersByTimeAsync(SUMMARY_RESUME_POLL_MS);
    await resumed;

    expect(store.getSummaryCacheEntry(id, 'key-points', 'fr')?.summary?.markdown).toBe('- point un');
  });

  it('lets go of the template even when the query fails', async () => {
    summarizer.setActiveSummarization(ACTIVE);
    vi.spyOn(summarizer, 'getSummary').mockRejectedValueOnce(new Error('disk'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const resumed = facade.resume();
    await vi.advanceTimersByTimeAsync(0);
    summarizer.setActiveSummarization(null);
    await vi.advanceTimersByTimeAsync(SUMMARY_RESUME_POLL_MS);
    await resumed;

    expect(store.summarizingKey()).toBeNull();
  });
});
