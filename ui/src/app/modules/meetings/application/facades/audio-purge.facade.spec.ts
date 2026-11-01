import { TestBed } from '@angular/core/testing';

import { AudioPurgePort } from '../../core/ports/audio-purge.port';
import { InMemoryAudioPurgeFake } from '../testing/in-memory-audio-purge.fake';
import { AudioPurgeFacade } from './audio-purge.facade';

describe('AudioPurgeFacade', () => {
  let fake: InMemoryAudioPurgeFake;
  let facade: AudioPurgeFacade;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AudioPurgeFacade, { provide: AudioPurgePort, useClass: InMemoryAudioPurgeFake }],
    });
    fake = TestBed.inject(AudioPurgePort) as InMemoryAudioPurgeFake;
    facade = TestBed.inject(AudioPurgeFacade);
  });

  it('reads the audio state of a meeting and clears it without one', async () => {
    fake.usages.set('m1', { bytes: 500, purged: false, canPurge: true });

    await facade.refreshUsage('m1');
    expect(facade.usage()?.canPurge).toBe(true);

    await facade.refreshUsage(null);
    expect(facade.usage()).toBeNull();
  });

  it('purges one meeting, reports what was freed and shows the purged state', async () => {
    fake.usages.set('m1', { bytes: 500, purged: false, canPurge: true });

    const ok = await facade.purge('m1');

    expect(ok).toBe(true);
    expect(facade.done()).toEqual({ count: 1, bytes: 500 });
    expect(facade.usage()?.purged).toBe(true);
  });

  it('a refused purge shows its message and leaves the state alone', async () => {
    fake.usages.set('m1', { bytes: 500, purged: false, canPurge: true });
    fake.failPurgeWith = 'the audio is kept until the meeting has a transcript';

    const ok = await facade.purge('m1');

    expect(ok).toBe(false);
    expect(facade.error()).toBe('the audio is kept until the meeting has a transcript');
    expect(facade.usage()?.purged).toBe(false);
  });

  it('counts before purging in bulk, then purges and shows the fresh count', async () => {
    fake.candidates = { count: 3, bytes: 3000 };

    await facade.loadPreview(90);
    expect(facade.preview()).toEqual({ count: 3, bytes: 3000 });

    await facade.purgeOlderThan(90);

    expect(facade.done()).toEqual({ count: 3, bytes: 3000 });
    expect(facade.preview()).toEqual({ count: 0, bytes: 0 });
    expect(fake.calls).toEqual(['preview:90', 'purgeOlderThan:90', 'preview:90']);
  });
});
