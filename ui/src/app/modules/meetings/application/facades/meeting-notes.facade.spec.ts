import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { MeetingNotesPort } from '../../core/ports/meeting-notes.port';
import { InMemoryMeetingNotesFake } from '../testing/in-memory-meeting-notes.fake';
import { MeetingNotesFacade, NOTES_SAVE_DELAY_MS } from './meeting-notes.facade';

describe('MeetingNotesFacade', () => {
  let fake: InMemoryMeetingNotesFake;
  let facade: MeetingNotesFacade;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [MeetingNotesFacade, { provide: MeetingNotesPort, useClass: InMemoryMeetingNotesFake }],
    });
    fake = TestBed.inject(MeetingNotesPort) as InMemoryMeetingNotesFake;
    facade = TestBed.inject(MeetingNotesFacade);
  });

  afterEach(() => vi.useRealTimers());

  it('shows the stored notes of the meeting, and nothing without a meeting', async () => {
    fake.notes.set('m1', 'hello');

    await facade.load('m1');
    expect(facade.text()).toBe('hello');

    await facade.load(null);
    expect(facade.text()).toBe('');
  });

  it('keeps typing on screen at once and writes it once typing pauses', async () => {
    await facade.load('m1');

    facade.edit('a');
    facade.edit('ab');
    expect(facade.text()).toBe('ab');
    expect(fake.saved).toEqual([]);

    await vi.advanceTimersByTimeAsync(NOTES_SAVE_DELAY_MS);

    expect(fake.saved).toEqual(['ab']);
    expect(facade.error()).toBeNull();
  });

  it('writes a pending edit to the right meeting before showing another one', async () => {
    fake.notes.set('m2', 'other');
    await facade.load('m1');
    facade.edit('typed for m1');

    await facade.load('m2');

    expect(fake.notes.get('m1')).toBe('typed for m1');
    expect(facade.text()).toBe('other');
  });

  it('a quick note is stamped, appended after any pending edit, and shown', async () => {
    await facade.load('m1');
    facade.edit('typed');

    await facade.addNote('check this', 760);

    expect(facade.text()).toBe('typed\n[00:12:40] check this\n');
  });

  it('ignores a blank quick note and edits without a meeting', async () => {
    facade.edit('lost');
    await facade.load('m1');
    await facade.addNote('   ', 3);

    expect(facade.text()).toBe('');
    expect(fake.saved).toEqual([]);
  });

  it('shows a failed save and keeps the text on screen', async () => {
    await facade.load('m1');
    fake.failSetWith = 'disk full';

    facade.edit('keep me');
    await facade.flush();

    expect(facade.error()).toBe('disk full');
    expect(facade.text()).toBe('keep me');
  });
});
