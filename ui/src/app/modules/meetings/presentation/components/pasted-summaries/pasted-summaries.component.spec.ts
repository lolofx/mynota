import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PastedSummariesComponent } from './pasted-summaries.component';
import type { PastedSummaryDraft } from './pasted-summaries.component';

describe('PastedSummariesComponent', () => {
  let fixture: ComponentFixture<PastedSummariesComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const click = (selector: string): void => {
    (el().querySelector(selector) as HTMLButtonElement).click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    fixture = TestBed.createComponent(PastedSummariesComponent);
    fixture.componentRef.setInput('items', [{ id: 1, label: 'Claude', markdown: '**bold** point', createdAt: new Date(0) }]);
    fixture.detectChanges();
  });

  it('is collapsed with a count until opened, then shows the label and the rendered text', () => {
    expect(el().querySelector('.item')).toBeNull();
    expect(el().querySelector('.toggle')?.textContent).toContain('(1)');

    click('.toggle');

    expect(el().querySelector('.label')?.textContent).toContain('Claude');
    expect(el().querySelector('.markdown strong')?.textContent).toBe('bold');
  });

  it('keeps a typed summary under its trimmed label and closes the form', () => {
    click('.toggle');
    click('.paste');
    const seen: PastedSummaryDraft[] = [];
    fixture.componentInstance.added.subscribe((draft) => seen.push(draft));
    const label = el().querySelector('.label-input') as HTMLInputElement;
    label.value = '  Claude ';
    label.dispatchEvent(new Event('input'));
    const text = el().querySelector('.text') as HTMLTextAreaElement;
    text.value = '- one';
    text.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    click('.save');

    expect(seen).toEqual([{ label: 'Claude', markdown: '- one' }]);
    expect(el().querySelector('.paste-form')).toBeNull();
  });

  it('cannot keep an empty paste', () => {
    click('.toggle');
    click('.paste');

    expect((el().querySelector('.save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks before removing and emits the id once confirmed', () => {
    click('.toggle');
    const seen: number[] = [];
    fixture.componentInstance.removed.subscribe((id) => seen.push(id));
    const confirm = vi.spyOn(window, 'confirm');

    confirm.mockReturnValueOnce(false);
    click('.remove');
    expect(seen).toEqual([]);

    confirm.mockReturnValueOnce(true);
    click('.remove');
    expect(seen).toEqual([1]);
    confirm.mockRestore();
  });
});
