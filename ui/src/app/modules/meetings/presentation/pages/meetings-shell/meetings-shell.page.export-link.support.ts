import type { Signal } from '@angular/core';
import { computed, effect, inject, untracked } from '@angular/core';

import { ExportFolderFacade } from '../../../application/facades/export-folder.facade';
import { MeetingsFacade } from '../../../application/facades/meetings.facade';
import type { ExportLink } from '../../../core/ports/export-folder.port';
import { FileDialogPort } from '../../../core/ports/file-dialog.port';

/** Export-link strip wiring (ADR 0022), grouped so `MeetingsShellPage` stays under the `max-lines` cap. */
export interface ExportLinkControls {
  readonly link: Signal<ExportLink | null>;
  readonly busy: Signal<boolean>;
  readonly error: Signal<string | null>;
  /** Asks for a Markdown file and links the open meeting to it. */
  readonly onRelink: () => void;
  readonly onRecreate: () => void;
  readonly onUnlink: () => void;
}

/**
 * Keeps the export state of the open meeting fresh (on selection and when
 * the export folder changes) and handles the strip's three actions. Facade
 * and dialog are optional: specs that predate the export link provide
 * neither, and the strip then stays hidden.
 */
export function createExportLinkControls(facade: MeetingsFacade): ExportLinkControls {
  const exportFolder = inject(ExportFolderFacade, { optional: true });
  const fileDialog = inject(FileDialogPort, { optional: true });
  const selection = facade as Partial<Pick<MeetingsFacade, 'selectedMeeting'>>;
  const selectedId = (): string | null => selection.selectedMeeting?.()?.id ?? null;

  effect(() => {
    const id = selectedId();
    exportFolder?.folder();
    untracked(() => void exportFolder?.refreshLink(id));
  });

  return {
    link: computed(() => exportFolder?.link() ?? null),
    busy: computed(() => exportFolder?.working() ?? false),
    error: computed(() => exportFolder?.linkError() ?? null),
    onRelink: () => {
      const id = selectedId();
      if (id === null || fileDialog === null || exportFolder === null) {
        return;
      }
      void (async () => {
        const file = await fileDialog.open([{ name: 'Markdown', extensions: ['md'] }]);
        if (file !== null) {
          await exportFolder.relink(id, file);
        }
      })();
    },
    onRecreate: () => {
      const id = selectedId();
      if (id !== null) {
        void exportFolder?.recreate(id);
      }
    },
    onUnlink: () => {
      const id = selectedId();
      if (id !== null) {
        void exportFolder?.unlink(id);
      }
    },
  };
}
