import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NotesPanelComponent, stampOf } from './notes-panel.component';

describe('NotesPanelComponent', () => {
  let fixture: ComponentFixture<NotesPanelComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(NotesPanelComponent);
    fixture.detectChanges();
  });

  const open = (): void => {
    (el().querySelector('.toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
  };

  it('is collapsed until opened', () => {
    expect(el().querySelector('textarea')).toBeNull();
    open();
    expect(el().querySelector('textarea')).not.toBeNull();
  });

  it('formats the stamp like the export does', () => {
    expect(stampOf(760.9)).toBe('00:12:40');
    expect(stampOf(3725)).toBe('01:02:05');
    expect(stampOf(-4)).toBe('00:00:00');
  });

  it('shows the time the next note will carry, and none without a clock', () => {
    open();
    expect(el().querySelector('.stamp')).toBeNull();

    fixture.componentRef.setInput('clockSec', 65);
    fixture.detectChanges();

    expect(el().querySelector('.stamp')?.textContent).toContain('[00:01:05]');
  });

  it('adds a trimmed quick note once and clears the box', () => {
    open();
    const seen: string[] = [];
    fixture.componentInstance.noteAdded.subscribe((note) => seen.push(note));
    const input = el().querySelector('.quick-input') as HTMLInputElement;
    input.value = '  check this  ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (el().querySelector('.add') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(seen).toEqual(['check this']);
    expect((el().querySelector('.quick-input') as HTMLInputElement).value).toBe('');
    expect((el().querySelector('.add') as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports what is typed in the notes', () => {
    open();
    const seen: string[] = [];
    fixture.componentInstance.textChanged.subscribe((text) => seen.push(text));
    const area = el().querySelector('textarea') as HTMLTextAreaElement;

    area.value = 'my notes';
    area.dispatchEvent(new Event('input'));

    expect(seen).toEqual(['my notes']);
  });
});
