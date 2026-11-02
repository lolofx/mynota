import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import type { AudioUsage } from '../../../core/ports/audio-purge.port';
import { AudioPurgeStripComponent } from './audio-purge-strip.component';

describe('AudioPurgeStripComponent', () => {
  let fixture: ComponentFixture<AudioPurgeStripComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const render = (usage: AudioUsage | null): void => {
    fixture.componentRef.setInput('usage', usage);
    fixture.detectChanges();
  };

  beforeEach(() => {
    fixture = TestBed.createComponent(AudioPurgeStripComponent);
  });

  it('renders nothing while unknown or when there is nothing to free', () => {
    render(null);
    expect(el().querySelector('.audio-purge-strip')).toBeNull();
    render({ bytes: 0, purged: false, canPurge: false });
    expect(el().querySelector('.audio-purge-strip')).toBeNull();
    render({ bytes: 900, purged: false, canPurge: false });
    expect(el().querySelector('.audio-purge-strip')).toBeNull();
  });

  it('offers the purge with the size, and asks before emitting', () => {
    render({ bytes: 5 * 1024 ** 3, purged: false, canPurge: true });
    expect(el().querySelector('.message')?.textContent).toContain('5 GB');
    const seen: string[] = [];
    fixture.componentInstance.purgeRequested.subscribe(() => seen.push('purge'));
    const confirm = vi.spyOn(window, 'confirm');

    confirm.mockReturnValueOnce(false);
    (el().querySelector('.purge') as HTMLButtonElement).click();
    expect(seen).toEqual([]);

    confirm.mockReturnValueOnce(true);
    (el().querySelector('.purge') as HTMLButtonElement).click();
    expect(seen).toEqual(['purge']);
    confirm.mockRestore();
  });

  it('says what a purged meeting can no longer do, without a button', () => {
    render({ bytes: 0, purged: true, canPurge: false });

    expect(el().querySelector('.message')).not.toBeNull();
    expect(el().querySelector('.purge')).toBeNull();
  });
});
