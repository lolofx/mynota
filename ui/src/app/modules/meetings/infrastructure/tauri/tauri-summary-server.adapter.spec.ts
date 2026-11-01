import { TestBed } from '@angular/core/testing';

import { installTauriInternalsStub, uninstallTauriInternalsStub } from './testing/tauri-internals.stub';
import { TauriSummaryServerAdapter } from './tauri-summary-server.adapter';

describe('TauriSummaryServerAdapter', () => {
  let adapter: TauriSummaryServerAdapter;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TauriSummaryServerAdapter] });
    adapter = TestBed.inject(TauriSummaryServerAdapter);
  });

  afterEach(() => uninstallTauriInternalsStub());

  it('get() reads the saved server', async () => {
    let command: string | undefined;
    installTauriInternalsStub((cmd) => {
      command = cmd;
      return { url: 'http://host.invalid:11434', model: 'm:1b', enabled: true };
    });

    const server = await adapter.get();

    expect(command).toBe('get_summary_server');
    expect(server).toEqual({ url: 'http://host.invalid:11434', model: 'm:1b', enabled: true });
  });

  it('save() sends the server under the "server" argument', async () => {
    let received: { cmd: string; args: unknown } | undefined;
    installTauriInternalsStub((cmd, args) => {
      received = { cmd, args };
      return null;
    });

    await adapter.save({ url: 'http://host.invalid', model: 'm', enabled: false });

    expect(received).toEqual({
      cmd: 'set_summary_server',
      args: { server: { url: 'http://host.invalid', model: 'm', enabled: false } },
    });
  });

  it('listModels() sends the address and returns the names', async () => {
    let received: { cmd: string; args: unknown } | undefined;
    installTauriInternalsStub((cmd, args) => {
      received = { cmd, args };
      return ['a:1b', 'b:2b'];
    });

    const names = await adapter.listModels('http://host.invalid');

    expect(received).toEqual({ cmd: 'list_summary_server_models', args: { url: 'http://host.invalid' } });
    expect(names).toEqual(['a:1b', 'b:2b']);
  });

  it('listModels() surfaces the readable reason when the server cannot be reached', async () => {
    installTauriInternalsStub(() => {
      throw { code: 'LLM', message: 'refusing to send meeting text to a non-local address' };
    });

    const error = await adapter.listModels('http://example.org').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('non-local address');
  });
});
