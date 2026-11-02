import { TestBed } from '@angular/core/testing';

import { VocabularyPort } from '../../core/ports/vocabulary.port';
import { InMemoryVocabularyFake } from '../testing/in-memory-vocabulary.fake';
import { VocabularyFacade } from './vocabulary.facade';

describe('VocabularyFacade', () => {
  let fake: InMemoryVocabularyFake;
  let facade: VocabularyFacade;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [VocabularyFacade, { provide: VocabularyPort, useClass: InMemoryVocabularyFake }],
    });
    fake = TestBed.inject(VocabularyPort) as InMemoryVocabularyFake;
    facade = TestBed.inject(VocabularyFacade);
  });

  it('loads the stored text into the draft, which is not dirty yet', async () => {
    fake.text = 'fumur = fumure';

    await facade.load();

    expect(facade.saved()).toBe('fumur = fumure');
    expect(facade.draft()).toBe('fumur = fumure');
    expect(facade.dirty()).toBe(false);
  });

  it('an edit makes it dirty and saving keeps it', async () => {
    await facade.load();

    facade.edit('Dyhia');
    expect(facade.dirty()).toBe(true);
    await facade.save();

    expect(fake.text).toBe('Dyhia');
    expect(facade.dirty()).toBe(false);
  });

  it('a refused save shows its message and stays dirty', async () => {
    await facade.load();
    fake.failSetWith = 'the vocabulary is too long';
    facade.edit('x');

    await facade.save();

    expect(facade.error()).toBe('the vocabulary is too long');
    expect(facade.dirty()).toBe(true);
    expect(facade.working()).toBe(false);
  });

  it('applying to the meetings saves a pending edit first and reports the count', async () => {
    await facade.load();
    fake.corrected = 7;
    facade.edit('la F = l\'AF');

    await facade.applyToMeetings();

    expect(fake.text).toBe("la F = l'AF");
    expect(fake.applied).toBe(1);
    expect(facade.corrected()).toBe(7);
  });
});
