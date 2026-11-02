import { TestBed } from '@angular/core/testing';

import { SettingsComponent } from './settings.component';

describe('SettingsComponent themed tabs', () => {
  const createFixture = () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.componentRef.setInput('updateConsent', 'unset');
    fixture.componentRef.setInput('selectedSummaryLanguage', 'en');
    fixture.detectChanges();
    return fixture;
  };

  const panels = (fixture: ReturnType<typeof createFixture>): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('.group'));
  const shown = (fixture: ReturnType<typeof createFixture>): number[] => panels(fixture).flatMap((panel, index) => (panel.hidden ? [] : [index]));

  it('opens on General and shows one theme at a time', () => {
    const fixture = createFixture();

    expect(panels(fixture).length).toBe(4);
    expect(shown(fixture)).toEqual([0]);
    expect(fixture.nativeElement.querySelector('.tab.active')?.getAttribute('data-tab')).toBe('general');
  });

  it('switches theme from the tabs', () => {
    const fixture = createFixture();

    (fixture.nativeElement.querySelector('[data-tab="summary"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(shown(fixture)).toEqual([1]);

    (fixture.nativeElement.querySelector('[data-tab="storage"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(shown(fixture)).toEqual([3]);
  });

  it('keeps each section under its theme', () => {
    const fixture = createFixture();
    const inGroup = (selector: string): number =>
      panels(fixture).findIndex((panel) => panel.querySelector(selector) !== null);

    expect(inGroup('.interface-language')).toBe(0);
    expect(inGroup('.update-settings')).toBe(0);
    expect(inGroup('.summary-model')).toBe(1);
    expect(inGroup('.summary-guidelines')).toBe(1);
    expect(inGroup('.export-folder')).toBe(3);
  });
});
