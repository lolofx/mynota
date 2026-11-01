import { TestBed } from '@angular/core/testing';

import { ExternalSummariesPort } from '../../core/ports/external-summaries.port';
import { InMemoryExternalSummariesFake } from '../testing/in-memory-external-summaries.fake';
import { ExternalSummariesFacade } from './external-summaries.facade';

describe('ExternalSummariesFacade', () => {
  let fake: InMemoryExternalSummariesFake;
  let facade: ExternalSummariesFacade;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ExternalSummariesFacade, { provide: ExternalSummariesPort, useClass: InMemoryExternalSummariesFake }],
    });
    fake = TestBed.inject(ExternalSummariesPort) as InMemoryExternalSummariesFake;
    facade = TestBed.inject(ExternalSummariesFacade);
  });

  it('shows the pasted summaries of the open meeting and clears them without one', async () => {
    await fake.add('m1', 'Claude', 'text');

    await facade.load('m1');
    expect(facade.items().map((s) => s.label)).toEqual(['Claude']);

    await facade.load(null);
    expect(facade.items()).toEqual([]);
  });

  it('keeps a pasted summary and shows the new list', async () => {
    await facade.load('m1');

    const kept = await facade.add('Claude', '- point');

    expect(kept).toBe(true);
    expect(facade.items().length).toBe(1);
    expect(facade.error()).toBeNull();
  });

  it('removes one and leaves the others', async () => {
    await facade.load('m1');
    await facade.add('A', 'one');
    await facade.add('B', 'two');

    await facade.remove(1);

    expect(facade.items().map((s) => s.label)).toEqual(['B']);
  });

  it('a refused paste shows its message and keeps the list', async () => {
    await facade.load('m1');
    fake.failAddWith = 'the pasted summary is empty';

    const kept = await facade.add('A', ' ');

    expect(kept).toBe(false);
    expect(facade.error()).toBe('the pasted summary is empty');
    expect(facade.working()).toBe(false);
  });

  it('does nothing without an open meeting', async () => {
    expect(await facade.add('A', 'x')).toBe(false);
  });
});
