import { TestBed } from '@angular/core/testing';

import { SettingsComponent } from './settings.component';

describe('SettingsComponent audio language', () => {
  const create = (audioLanguage?: string) => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.componentRef.setInput('updateConsent', 'unset');
    fixture.componentRef.setInput('selectedSummaryLanguage', 'en');
    if (audioLanguage !== undefined) {
      fixture.componentRef.setInput('audioLanguage', audioLanguage);
    }
    fixture.detectChanges();
    return fixture;
  };

  it('selects the current default language', () => {
    const select: HTMLSelectElement = create('fr').nativeElement.querySelector('.audio-language-select');

    expect(select.value).toBe('fr');
  });

  it('defaults to auto', () => {
    const select: HTMLSelectElement = create().nativeElement.querySelector('.audio-language-select');

    expect(select.value).toBe('auto');
  });

  it('emits the language picked', () => {
    const fixture = create();
    const picked: string[] = [];
    fixture.componentInstance.audioLanguageSelected.subscribe((code) => picked.push(code));
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('.audio-language-select');

    select.value = 'en';
    select.dispatchEvent(new Event('change'));

    expect(picked).toEqual(['en']);
  });
});
