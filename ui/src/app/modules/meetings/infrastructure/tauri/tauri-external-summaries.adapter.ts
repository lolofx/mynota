import { Injectable } from '@angular/core';

import type { ExternalSummary } from '../../core/models/external-summary.model';
import { ExternalSummariesPort } from '../../core/ports/external-summaries.port';
import type { ExternalSummaryDto } from '../dto/external-summary.dto';
import { invokeCommand } from './ipc';

const toDomain = (dtos: readonly ExternalSummaryDto[]): readonly ExternalSummary[] =>
  dtos.map((dto) => ({ id: dto.id, label: dto.label, markdown: dto.markdown, createdAt: new Date(dto.createdAt) }));

/** `ExternalSummariesPort` backed by the Tauri IPC command surface. */
@Injectable()
export class TauriExternalSummariesAdapter extends ExternalSummariesPort {
  override async list(meetingId: string): Promise<readonly ExternalSummary[]> {
    return toDomain(await invokeCommand('list_external_summaries', { meetingId }));
  }

  override async add(meetingId: string, label: string, markdown: string): Promise<readonly ExternalSummary[]> {
    return toDomain(await invokeCommand('add_external_summary', { meetingId, label, markdown }));
  }

  override async remove(meetingId: string, summaryId: number): Promise<readonly ExternalSummary[]> {
    return toDomain(await invokeCommand('delete_external_summary', { meetingId, summaryId }));
  }

  override async buildPrompt(meetingId: string, template: string, language: string): Promise<string> {
    return invokeCommand('build_external_prompt', { meetingId, template, language });
  }
}
