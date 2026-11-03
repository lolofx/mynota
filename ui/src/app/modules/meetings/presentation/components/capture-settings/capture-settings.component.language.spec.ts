import { TestBed } from '@angular/core/testing';

import { CaptureSettingsComponent } from './capture-settings.component';

describe('CaptureSettingsComponent meeting language and speakers', () => {
  const open = (captureSource: 'microphone' | 'mixed' = 'mixed') => {
    const fixture = TestBed.createComponent(CaptureSettingsComponent);
    fixture.componentRef.setInput('captureSource', captureSource);
    fixture.componentRef.setInput('systemAudioStatus', { kind: 'available' });
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.trigger').click();
    fixture.detectChanges();
    return fixture;
  };

  it('keeps the trigger unchanged while the language is auto', () => {
    const fixture = open();

    expect(fixture.nativeElement.querySelector('.trigger').textContent).not.toContain('·');
  });

  it('adds the chosen language to the trigger', () => {
    const fixture = open();
    fixture.componentRef.setInput('audioLanguage', 'en');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.trigger').textContent).toContain('Mic + System · EN');
  });

  it('emits the language picked in the select', () => {
    const fixture = open();
    const picked: string[] = [];
    fixture.componentInstance.audioLanguageSelected.subscribe((code) => picked.push(code));
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('#capture-language');

    select.value = 'fr';
    select.dispatchEvent(new Event('change'));

    expect(picked).toEqual(['fr']);
  });

  it('emits a whole speaker count and null for an empty or out-of-range value', () => {
    const fixture = open();
    const counts: (number | null)[] = [];
    fixture.componentInstance.expectedSpeakersChanged.subscribe((count) => counts.push(count));
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#capture-speakers');

    for (const value of ['3', '', '40']) {
      input.value = value;
      input.dispatchEvent(new Event('change'));
    }

    expect(counts).toEqual([3, null, null]);
  });

  it('disables the speaker count for a microphone-only recording', () => {
    const fixture = open('microphone');

    expect(fixture.nativeElement.querySelector('#capture-speakers').disabled).toBe(true);
  });
});
