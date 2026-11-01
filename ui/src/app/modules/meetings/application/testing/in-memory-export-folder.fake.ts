import { Injectable } from '@angular/core';

import type { ExportLink } from '../../core/ports/export-folder.port';
import { ExportFolderPort } from '../../core/ports/export-folder.port';

/** In-memory ExportFolderPort implementation for specs. */
@Injectable()
export class InMemoryExportFolderFake extends ExportFolderPort {
  private folder: string | null = null;
  /** Meeting ids passed to `exportMeeting`, in call order. */
  readonly exported: string[] = [];
  /** When set, `set` rejects with this message (simulates an unusable folder). */
  failSetWith: string | null = null;

  override async get(): Promise<string | null> {
    return this.folder;
  }

  override async set(folder: string | null): Promise<void> {
    if (this.failSetWith !== null) {
      throw new Error(this.failSetWith);
    }
    this.folder = folder;
  }

  override async exportMeeting(meetingId: string): Promise<string> {
    if (this.folder === null) {
      throw new Error('no export folder is configured');
    }
    this.exported.push(meetingId);
    return `${this.folder}/${meetingId}.md`;
  }

  /** Link state per meeting id; a meeting without an entry reads as not exported. */
  readonly links = new Map<string, ExportLink>();
  /** Calls to the link commands, as `command:meetingId[:file]`, in order. */
  readonly linkCalls: string[] = [];
  /** When set, `relink` rejects with this message. */
  failRelinkWith: string | null = null;

  override async getLink(meetingId: string): Promise<ExportLink> {
    if (this.folder === null) {
      return { state: 'noFolder', path: null };
    }
    return this.links.get(meetingId) ?? { state: 'notExported', path: null };
  }

  override async relink(meetingId: string, file: string): Promise<void> {
    this.linkCalls.push(`relink:${meetingId}:${file}`);
    if (this.failRelinkWith !== null) {
      throw new Error(this.failRelinkWith);
    }
    this.links.set(meetingId, { state: 'linked', path: file });
  }

  override async recreate(meetingId: string): Promise<string> {
    this.linkCalls.push(`recreate:${meetingId}`);
    const path = `${this.folder}/${meetingId}.md`;
    this.links.set(meetingId, { state: 'linked', path });
    return path;
  }

  override async unlink(meetingId: string): Promise<void> {
    this.linkCalls.push(`unlink:${meetingId}`);
    this.links.set(meetingId, { state: 'notExported', path: null });
  }

  override async rescan(): Promise<number> {
    this.linkCalls.push('rescan');
    return 0;
  }

  /** Test helper: replace the stored folder. */
  seed(folder: string | null): void {
    this.folder = folder;
  }
}
