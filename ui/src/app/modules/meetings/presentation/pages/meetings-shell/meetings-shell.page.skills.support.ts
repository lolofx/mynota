import type { Signal } from '@angular/core';
import { computed, signal } from '@angular/core';

import { MeetingsFacade } from '../../../application/facades/meetings.facade';
import type { SkillOption } from '../../components/settings/settings.component';
import { computeEffectivePrompt } from '../../components/meeting-detail-pane/meeting-detail-pane.component.support';
import { formatTemplateLabel } from '../../utils/format-display.util';

/** Skill (summary template) editor opened from Settings, with no meeting needed. */
export interface SkillEditorControls {
  /** Every skill, for the list in Settings. */
  readonly options: Signal<readonly SkillOption[]>;
  /** Name of the skill being edited; `null` when the editor is closed. */
  readonly open: Signal<string | null>;
  readonly label: Signal<string>;
  readonly description: Signal<string>;
  readonly builtin: Signal<string>;
  readonly effective: Signal<string>;
  readonly loading: Signal<boolean>;
  readonly error: Signal<string>;
  readonly onOpen: (name: string) => void;
  readonly onClose: () => void;
  readonly onSaved: (prompt: string) => void;
  readonly onReset: () => void;
}

/**
 * The skills of the summary tabs are edited here, from Settings: the same
 * prompt editor as the tab's cogwheel, reachable before any meeting is open.
 * What is saved is what both the tab and the combined report use. The facade
 * is read through `Partial` so shell specs with a reduced stub still build.
 */
export function createSkillEditorControls(facade: MeetingsFacade): SkillEditorControls {
  const source = facade as Partial<
    Pick<
      MeetingsFacade,
      'templates' | 'templatePrompts' | 'templatePromptLoading' | 'loadTemplatePrompt' | 'saveTemplatePrompt' | 'resetTemplatePrompt' | 'error'
    >
  >;
  const open = signal<string | null>(null);
  const error = signal('');
  const templates = (): ReturnType<NonNullable<typeof source.templates>> => source.templates?.() ?? [];
  const current = computed(() => templates().find((template) => template.name === open()));

  const finish = (action: 'saveTemplatePrompt' | 'resetTemplatePrompt', closeOnSuccess: boolean): void => {
    const failure = source.error?.();
    if (failure && failure.source === action) {
      error.set(failure.message);
    } else if (closeOnSuccess) {
      open.set(null);
    }
  };

  return {
    options: computed(() => templates().map((template) => ({ name: template.name, label: formatTemplateLabel(template), description: template.description }))),
    open: open.asReadonly(),
    label: computed(() => {
      const template = current();
      return template ? formatTemplateLabel(template) : (open() ?? '');
    }),
    description: computed(() => current()?.description ?? ''),
    builtin: computed(() => current()?.prompt ?? ''),
    effective: computed(() => {
      const name = open();
      return name === null ? '' : computeEffectivePrompt(templates(), source.templatePrompts?.() ?? new Map(), name);
    }),
    loading: computed(() => {
      const name = open();
      return name !== null && (source.templatePromptLoading?.().has(name) ?? false);
    }),
    error: error.asReadonly(),
    onOpen: (name) => {
      error.set('');
      open.set(name);
      void source.loadTemplatePrompt?.(name);
    },
    onClose: () => {
      open.set(null);
      error.set('');
    },
    onSaved: (prompt) => {
      const name = open();
      if (name !== null) {
        error.set('');
        void source.saveTemplatePrompt?.(name, prompt).then(() => finish('saveTemplatePrompt', true));
      }
    },
    onReset: () => {
      const name = open();
      if (name !== null) {
        error.set('');
        void source.resetTemplatePrompt?.(name).then(() => finish('resetTemplatePrompt', false));
      }
    },
  };
}
