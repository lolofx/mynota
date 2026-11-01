import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { ExportLink } from '../../../core/ports/export-folder.port';
import { ExportLinkStripComponent } from './export-link-strip.component';

describe('ExportLinkStripComponent', () => {
  let fixture: ComponentFixture<ExportLinkStripComponent>;

  function render(link: ExportLink | null, error: string | null = null): HTMLElement {
    fixture.componentRef.setInput('link', link);
    fixture.componentRef.setInput('error', error);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(ExportLinkStripComponent);
  });

  it('renders nothing while exporting is off or the state is unknown', () => {
    expect(render(null).querySelector('.export-link-strip')).toBeNull();
    expect(render({ state: 'noFolder', path: null }).querySelector('.export-link-strip')).toBeNull();
  });

  it('shows the linked file with relink and unlink', () => {
    const el = render({ state: 'linked', path: '/notes/a.md' });

    expect(el.querySelector('.path')?.textContent).toContain('/notes/a.md');
    expect(el.querySelector('.relink')).not.toBeNull();
    expect(el.querySelector('.unlink')).not.toBeNull();
    expect(el.querySelector('.recreate')).toBeNull();
  });

  it('a missing file offers relink, recreate and unlink and says so', () => {
    const el = render({ state: 'missing', path: null });

    expect(el.querySelector('.export-link-strip')?.classList).toContain('is-missing');
    expect(el.querySelector('.relink')).not.toBeNull();
    expect(el.querySelector('.recreate')).not.toBeNull();
    expect(el.querySelector('.unlink')).not.toBeNull();
  });

  it('emits one request per button', () => {
    const el = render({ state: 'missing', path: null });
    const seen: string[] = [];
    fixture.componentInstance.relinkRequested.subscribe(() => seen.push('relink'));
    fixture.componentInstance.recreateRequested.subscribe(() => seen.push('recreate'));
    fixture.componentInstance.unlinkRequested.subscribe(() => seen.push('unlink'));

    (el.querySelector('.relink') as HTMLButtonElement).click();
    (el.querySelector('.recreate') as HTMLButtonElement).click();
    (el.querySelector('.unlink') as HTMLButtonElement).click();

    expect(seen).toEqual(['relink', 'recreate', 'unlink']);
  });

  it('disables the buttons while busy and shows a failed action', () => {
    fixture.componentRef.setInput('busy', true);
    const el = render({ state: 'missing', path: null }, 'this file belongs to another meeting');

    expect((el.querySelector('.relink') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('.error')?.textContent).toContain('another meeting');
  });
});
