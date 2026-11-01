import { Injectable } from '@angular/core';

import type { SummaryServer } from '../../core/models/summary-server.model';
import { SummaryServerPort } from '../../core/ports/summary-server.port';
import { invokeCommand } from './ipc';

/** `SummaryServerPort` backed by the Tauri IPC command surface. */
@Injectable()
export class TauriSummaryServerAdapter extends SummaryServerPort {
  override async get(): Promise<SummaryServer> {
    const dto = await invokeCommand('get_summary_server', {});
    return { url: dto.url, model: dto.model, enabled: dto.enabled };
  }

  override async save(server: SummaryServer): Promise<void> {
    await invokeCommand('set_summary_server', {
      server: { url: server.url, model: server.model, enabled: server.enabled },
    });
  }

  override async listModels(url: string): Promise<readonly string[]> {
    return invokeCommand('list_summary_server_models', { url });
  }
}
