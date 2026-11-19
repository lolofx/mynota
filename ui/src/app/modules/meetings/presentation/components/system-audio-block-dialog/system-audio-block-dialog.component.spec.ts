import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { SystemAudioBlockDialogComponent } from './system-audio-block-dialog.component';

describe('SystemAudioBlockDialogComponent', () => {
  const create = (block: 'start-refused' | 'lost-during-recording' | null, status?: object) => {
    const fixture = TestBed.createComponent(SystemAudioBlockDialogComponent);
    fixture.componentRef.setInput('block', block);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return fixture;
  };
  const buttons = (root: HTMLElement) => [...root.querySelectorAll('button')].map((button) => button.className);

  it('renders nothing when nothing blocks', () => {
    const fixture = create(null);
    expect(fixture.nativeElement.querySelector('.system-audio-block-dialog')).toBeNull();
  });

  it('offers the permission grant when a start is refused for denied permission', () => {
    const fixture = create('start-refused', { kind: 'permission_denied', restartRequired: false });
    const dialog = fixture.nativeElement.querySelector('.system-audio-block-dialog');

    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(buttons(dialog)).toEqual(expect.arrayContaining(['grant', 'retry']));
    expect(dialog.querySelector('.close')).not.toBeNull();
  });

  it('offers only a stop for a lost capture, with no close button', () => {
    const fixture = create('lost-during-recording', { kind: 'available' });
    const dialog = fixture.nativeElement.querySelector('.system-audio-block-dialog');

    expect(buttons(dialog)).toEqual(['stop']);
    expect(dialog.querySelector('.close')).toBeNull();
  });

  it('closes a refused start on Escape but never a lost capture', () => {
    const refused = create('start-refused');
    let dismissed = 0;
    refused.componentInstance.dismissRequested.subscribe(() => dismissed++);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dismissed).toBe(1);

    const lost = create('lost-during-recording');
    let lostDismissed = 0;
    lost.componentInstance.dismissRequested.subscribe(() => lostDismissed++);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(lostDismissed).toBe(0);
  });
});
