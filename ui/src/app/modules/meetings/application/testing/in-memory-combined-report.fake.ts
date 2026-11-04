import { Injectable } from '@angular/core';

import type { CombinedResult } from '../../core/models/combined-report.model';
import { CombinedReportPort } from '../../core/ports/combined-report.port';

const summaryOf = (template: string, language: string, markdown: string) => ({
  template,
  markdown,
  createdAt: new Date(0),
  language,
  stale: false,
});

/** In-memory CombinedReportPort implementation for specs. */
@Injectable()
export class InMemoryCombinedReportFake extends CombinedReportPort {
  /** Calls received, in order. */
  readonly generated: { meetingId: string; templates: readonly string[]; language: string }[] = [];
  /** Tabs the fake leaves out of a generated report. */
  skip: readonly string[] = [];
  /** When set, `generate` and `importReport` reject with this message. */
  failWith: string | null = null;

  override async generate(meetingId: string, templates: readonly string[], language: string): Promise<CombinedResult> {
    this.generated.push({ meetingId, templates, language });
    if (this.failWith !== null) {
      throw new Error(this.failWith);
    }
    const kept = templates.filter((name) => !this.skip.includes(name));
    return {
      saved: kept.map((name) => summaryOf(name, language, `generated ${name}`)),
      missing: templates.filter((name) => this.skip.includes(name)),
      ignored: [],
    };
  }

  override async buildPrompt(meetingId: string, templates: readonly string[], language: string): Promise<string> {
    return `PROMPT ${meetingId} ${templates.join(',')} ${language}`;
  }

  override async importReport(_meetingId: string, language: string, text: string): Promise<CombinedResult> {
    if (this.failWith !== null) {
      throw new Error(this.failWith);
    }
    const names = [...text.matchAll(/### SECTION: ([a-z0-9-]+)/g)].map((match) => match[1] ?? '');
    return { saved: names.map((name) => summaryOf(name, language, `imported ${name}`)), missing: [], ignored: [] };
  }
}
