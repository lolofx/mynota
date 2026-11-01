import { TestBed } from '@angular/core/testing';

import type { SummaryServer } from '../../../core/models/summary-server.model';
import { SummaryServerPort } from '../../../core/ports/summary-server.port';
import { SummaryServerSettingsComponent } from './summary-server-settings.component';

class FakeSummaryServerPort extends SummaryServerPort {
  saved: SummaryServer | null = null;
  listed: string[] = [];
  saveError: Error | null = null;
  listError: Error | null = null;
  constructor(private stored: SummaryServer = { url: '', model: '', enabled: false }) {
    super();
  }
  override get(): Promise<SummaryServer> {
    return Promise.resolve(this.stored);
  }
  override save(server: SummaryServer): Promise<void> {
    if (this.saveError) {
      return Promise.reject(this.saveError);
    }
    this.saved = server;
    return Promise.resolve();
  }
  override listModels(): Promise<readonly string[]> {
    return this.listError ? Promise.reject(this.listError) : Promise.resolve(this.listed);
  }
}

describe('SummaryServerSettingsComponent', () => {
  const create = async (port: SummaryServerPort | null) => {
    if (port) {
      TestBed.configureTestingModule({ providers: [{ provide: SummaryServerPort, useValue: port }] });
    }
    const fixture = TestBed.createComponent(SummaryServerSettingsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  };
  const el = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement;
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('renders nothing when the port is not provided', async () => {
    const fixture = await create(null);

    expect(el(fixture).querySelector('.summary-server')).toBeNull();
  });

  it('shows the saved server', async () => {
    const port = new FakeSummaryServerPort({ url: 'http://host.invalid:11434', model: 'm:1b', enabled: true });
    const fixture = await create(port);

    expect((el(fixture).querySelector('.server-url') as HTMLInputElement).value).toBe('http://host.invalid:11434');
    expect((el(fixture).querySelector('.server-enabled') as HTMLInputElement).checked).toBe(true);
    expect((el(fixture).querySelector('.server-model') as HTMLSelectElement).value).toBe('m:1b');
  });

  it('keeps "Test" disabled until an address is typed', async () => {
    const fixture = await create(new FakeSummaryServerPort());
    const test = el(fixture).querySelector('.test-connection') as HTMLButtonElement;
    expect(test.disabled).toBe(true);

    type(el(fixture).querySelector('.server-url') as HTMLInputElement, 'http://host.invalid');
    fixture.detectChanges();

    expect(test.disabled).toBe(false);
  });

  it('lists the models of the server and selects the first one', async () => {
    const port = new FakeSummaryServerPort();
    port.listed = ['a:1b', 'b:2b'];
    const fixture = await create(port);
    type(el(fixture).querySelector('.server-url') as HTMLInputElement, 'http://host.invalid');
    fixture.detectChanges();

    (el(fixture).querySelector('.test-connection') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const options = Array.from(el(fixture).querySelectorAll('.server-model option')).map((o) => o.textContent?.trim());
    expect(options).toEqual(['a:1b', 'b:2b']);
    expect((el(fixture).querySelector('.server-model') as HTMLSelectElement).value).toBe('a:1b');
    expect(el(fixture).querySelector('.note')?.textContent).toContain('2');
  });

  it('shows the reason when the server cannot be reached', async () => {
    const port = new FakeSummaryServerPort();
    port.listError = new Error('cannot resolve host');
    const fixture = await create(port);
    type(el(fixture).querySelector('.server-url') as HTMLInputElement, 'http://host.invalid');
    fixture.detectChanges();

    (el(fixture).querySelector('.test-connection') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const note = el(fixture).querySelector('.note') as HTMLElement;
    expect(note.textContent).toContain('cannot resolve host');
    expect(note.getAttribute('role')).toBe('alert');
  });

  it('saves the address, the chosen model and the switch', async () => {
    const port = new FakeSummaryServerPort();
    port.listed = ['a:1b'];
    const fixture = await create(port);
    type(el(fixture).querySelector('.server-url') as HTMLInputElement, ' http://host.invalid ');
    fixture.detectChanges();
    (el(fixture).querySelector('.test-connection') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    const toggle = el(fixture).querySelector('.server-enabled') as HTMLInputElement;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));

    (el(fixture).querySelector('.save-server') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(port.saved).toEqual({ url: 'http://host.invalid', model: 'a:1b', enabled: true });
  });

  it('shows the refusal when saving fails', async () => {
    const port = new FakeSummaryServerPort();
    port.saveError = new Error('https is not supported');
    const fixture = await create(port);

    (el(fixture).querySelector('.save-server') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el(fixture).querySelector('.note')?.textContent).toContain('https is not supported');
  });
});
