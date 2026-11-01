import { TestBed } from '@angular/core/testing';

import { ExportFolderPort } from '../../core/ports/export-folder.port';
import { InMemoryExportFolderFake } from '../testing/in-memory-export-folder.fake';
import { ExportFolderFacade } from './export-folder.facade';

describe('ExportFolderFacade', () => {
  let fake: InMemoryExportFolderFake;
  let facade: ExportFolderFacade;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ExportFolderFacade, { provide: ExportFolderPort, useClass: InMemoryExportFolderFake }],
    });
    fake = TestBed.inject(ExportFolderPort) as InMemoryExportFolderFake;
    facade = TestBed.inject(ExportFolderFacade);
  });

  it('starts unloaded: the folder is undefined, not "off"', () => {
    expect(facade.folder()).toBeUndefined();
    expect(facade.error()).toBeNull();
    expect(facade.working()).toBe(false);
  });

  it('load() reports the stored folder, or null while exporting is off', async () => {
    await facade.load();
    expect(facade.folder()).toBeNull();

    fake.seed('/notes');
    await facade.load();
    expect(facade.folder()).toBe('/notes');
  });

  it('choose() saves the folder and shows what the backend stored', async () => {
    await facade.choose('/notes');

    expect(facade.folder()).toBe('/notes');
    expect(facade.error()).toBeNull();
    expect(facade.working()).toBe(false);
  });

  it('choose(null) turns exporting off', async () => {
    fake.seed('/notes');
    await facade.load();

    await facade.choose(null);

    expect(facade.folder()).toBeNull();
  });

  it('is never optimistic: a rejected folder keeps the previous one and surfaces the message', async () => {
    fake.seed('/notes');
    await facade.load();
    fake.failSetWith = 'the export folder must be an absolute path';

    await facade.choose('relative');

    expect(facade.folder()).toBe('/notes');
    expect(facade.error()).toBe('the export folder must be an absolute path');
    expect(facade.working()).toBe(false);
  });

  it('clears the previous error when the next attempt starts', async () => {
    fake.failSetWith = 'unusable';
    await facade.choose('relative');
    expect(facade.error()).toBe('unusable');

    fake.failSetWith = null;
    await facade.choose('/notes');

    expect(facade.error()).toBeNull();
    expect(facade.folder()).toBe('/notes');
  });

  it('reports working while a write is in flight', async () => {
    const seen: boolean[] = [];
    const pending = facade.choose('/notes');
    seen.push(facade.working());
    await pending;
    seen.push(facade.working());

    expect(seen).toEqual([true, false]);
  });
});

describe('ExportFolderFacade export link', () => {
  let fake: InMemoryExportFolderFake;
  let facade: ExportFolderFacade;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ExportFolderFacade, { provide: ExportFolderPort, useClass: InMemoryExportFolderFake }],
    });
    fake = TestBed.inject(ExportFolderPort) as InMemoryExportFolderFake;
    facade = TestBed.inject(ExportFolderFacade);
  });

  it('reads the state of a meeting, and clears it when no meeting is shown', async () => {
    fake.seed('/notes');
    fake.links.set('m1', { state: 'missing', path: null });

    await facade.refreshLink('m1');
    expect(facade.link()).toEqual({ state: 'missing', path: null });

    await facade.refreshLink(null);
    expect(facade.link()).toBeNull();
  });

  it('reports noFolder while exporting is off', async () => {
    await facade.refreshLink('m1');
    expect(facade.link()?.state).toBe('noFolder');
  });

  it('drops the answer for a meeting that is no longer shown', async () => {
    fake.seed('/notes');
    fake.links.set('slow', { state: 'linked', path: '/notes/slow.md' });
    fake.links.set('fast', { state: 'missing', path: null });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = fake.getLink.bind(fake);
    fake.getLink = async (id: string) => {
      if (id === 'slow') {
        await gate;
      }
      return original(id);
    };

    const slow = facade.refreshLink('slow');
    await facade.refreshLink('fast');
    release();
    await slow;

    expect(facade.link()?.state).toBe('missing');
  });

  it('relink adopts the chosen file and shows the new state', async () => {
    fake.seed('/notes');

    await facade.relink('m1', '/notes/sub/m1.md');

    expect(fake.linkCalls).toEqual(['relink:m1:/notes/sub/m1.md']);
    expect(facade.link()).toEqual({ state: 'linked', path: '/notes/sub/m1.md' });
    expect(facade.linkError()).toBeNull();
  });

  it('a refused relink shows its message and keeps the previous state', async () => {
    fake.seed('/notes');
    fake.links.set('m1', { state: 'missing', path: null });
    fake.failRelinkWith = 'this file belongs to another meeting';

    await facade.relink('m1', '/notes/other.md');

    expect(facade.linkError()).toBe('this file belongs to another meeting');
    expect(facade.link()?.state).toBe('missing');
    expect(facade.working()).toBe(false);
  });

  it('recreate and unlink go through the port and refresh the state', async () => {
    fake.seed('/notes');

    await facade.recreate('m1');
    expect(facade.link()?.state).toBe('linked');

    await facade.unlink('m1');
    expect(facade.link()?.state).toBe('notExported');
    expect(fake.linkCalls).toEqual(['recreate:m1', 'unlink:m1']);
  });
});
