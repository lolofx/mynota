import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { CombinedReportComponent } from './combined-report.component';

describe('CombinedReportComponent', () => {
  let fixture: ComponentFixture<CombinedReportComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const click = (selector: string): void => {
    (el().querySelector(selector) as HTMLButtonElement).click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    fixture = TestBed.createComponent(CombinedReportComponent);
    fixture.componentRef.setInput('templates', [
      { name: 'key-points', label: 'Key Points' },
      { name: 'decisions', label: 'Decisions' },
    ]);
    fixture.componentRef.setInput('selected', ['key-points']);
    fixture.detectChanges();
    click('.toggle');
  });

  it('is collapsed until opened and then lists the tabs with the ticked ones checked', () => {
    const boxes = Array.from(el().querySelectorAll<HTMLInputElement>('.choice input'));

    expect(boxes.map((box) => box.checked)).toEqual([true, false]);
  });

  it('reports a tick', () => {
    const toggled = vi.fn();
    fixture.componentInstance.toggled.subscribe(toggled);
    const box = el().querySelectorAll<HTMLInputElement>('.choice input')[1] as HTMLInputElement;

    box.checked = true;
    box.dispatchEvent(new Event('change'));

    expect(toggled).toHaveBeenCalledWith({ name: 'decisions', checked: true });
  });

  it('cannot run without a ticked tab', () => {
    fixture.componentRef.setInput('selected', []);
    fixture.detectChanges();

    expect((el().querySelector('.generate') as HTMLButtonElement).disabled).toBe(true);
    expect((el().querySelector('.copy') as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks to generate and to copy', () => {
    const generate = vi.fn();
    const copy = vi.fn();
    fixture.componentInstance.generateRequested.subscribe(generate);
    fixture.componentInstance.copyRequested.subscribe(copy);

    click('.generate');
    click('.copy');

    expect(generate).toHaveBeenCalledTimes(1);
    expect(copy).toHaveBeenCalledTimes(1);
  });

  it('offers Cancel instead of the actions while working', () => {
    fixture.componentRef.setInput('working', true);
    fixture.detectChanges();

    expect(el().querySelector('.generate')).toBeNull();
    expect(el().querySelector('.cancel')).not.toBeNull();
  });

  it('imports the pasted text and closes the form', () => {
    const imported = vi.fn();
    fixture.componentInstance.importRequested.subscribe(imported);
    click('.import');
    const area = el().querySelector('.text') as HTMLTextAreaElement;
    area.value = '### SECTION: decisions\n- d';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    click('.save');

    expect(imported).toHaveBeenCalledWith('### SECTION: decisions\n- d');
    expect(el().querySelector('.import-form')).toBeNull();
  });

  it('cannot import an empty paste', () => {
    click('.import');

    expect((el().querySelector('.save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('names the tabs a report left out', () => {
    fixture.componentRef.setInput('outcome', { kind: 'generated', saved: 1, missing: ['decisions'], ignored: [] });
    fixture.detectChanges();

    expect(el().textContent).toContain('decisions');
  });
});
