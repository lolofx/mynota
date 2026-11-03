import { Injectable } from '@angular/core';

import type { CombinedResult } from '../../core/models/combined-report.model';
import { CombinedReportPort } from '../../core/ports/combined-report.port';
import { mapSummaryDtoToDomain } from '../mappers/summary.mapper';
import type { CombinedResultDto } from '../dto/summary.dto';
import { invokeCommand } from './ipc';

const toDomain = (dto: CombinedResultDto): CombinedResult => ({
  saved: dto.saved.map(mapSummaryDtoToDomain),
  missing: dto.missing,
  ignored: dto.ignored,
});

/** `CombinedReportPort` backed by the Tauri IPC command surface. */
@Injectable()
export class TauriCombinedReportAdapter extends CombinedReportPort {
  override async generate(meetingId: string, templates: readonly string[], language: string): Promise<CombinedResult> {
    return toDomain(await invokeCommand('summarize_combined', { meetingId, templates: [...templates], language }));
  }

  override async buildPrompt(meetingId: string, templates: readonly string[], language: string): Promise<string> {
    return invokeCommand('build_external_prompt', { meetingId, templates: [...templates], language });
  }

  override async importReport(meetingId: string, language: string, text: string): Promise<CombinedResult> {
    return toDomain(await invokeCommand('import_combined_report', { meetingId, language, text }));
  }
}
