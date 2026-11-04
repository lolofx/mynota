import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { SettingsComponent } from './settings.component';

describe('SettingsComponent skills', () => {
  const create = () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.componentRef.setInput('updateConsent', 'unset');
    fixture.componentRef.setInput('selectedSummaryLanguage', 'en');
    fixture.componentRef.setInput('skills', [
      { name: 'key-points', label: '🔑 Key Points', description: 'd1' },
      { name: 'decisions', label: '⚖️ Decisions', description: 'd2' },
    ]);
    fixture.detectChanges();
    return fixture;
  };

  it('lists each skill under the summaries theme', () => {
    const fixture = create();
    const labels = Array.from(fixture.nativeElement.querySelectorAll('.skill .skill-label')).map((node) => (node as HTMLElement).textContent?.trim());

    expect(labels).toEqual(['🔑 Key Points', '⚖️ Decisions']);
    const panels = Array.from(fixture.nativeElement.querySelectorAll('.group')) as HTMLElement[];
    expect(panels.findIndex((panel) => panel.querySelector('.skills') !== null)).toBe(1);
  });

  it('asks to edit the skill whose button is pressed', () => {
    const fixture = create();
    const requested = vi.fn();
    fixture.componentInstance.skillEditRequested.subscribe(requested);

    (fixture.nativeElement.querySelector('[data-skill="decisions"]') as HTMLButtonElement).click();

    expect(requested).toHaveBeenCalledWith('decisions');
  });
});
