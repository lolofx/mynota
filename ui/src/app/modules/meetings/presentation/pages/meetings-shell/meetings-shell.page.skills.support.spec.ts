import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';

import type { MeetingsFacade } from '../../../application/facades/meetings.facade';
import type { SummaryTemplate } from '../../../core/models/summary-template.model';
import { createSkillEditorControls } from './meetings-shell.page.skills.support';

const TEMPLATES: readonly SummaryTemplate[] = [
  { name: 'key-points', description: 'Key points', prompt: 'BUILT-IN {transcript}', label: 'Key Points', emoji: '🔑' },
];

describe('createSkillEditorControls', () => {
  const setup = (overrides: Record<string, string> = {}, failure: { source: string; message: string } | null = null) => {
    const prompts = signal<ReadonlyMap<string, string>>(new Map(Object.entries(overrides)));
    const error = signal(failure);
    const facade = {
      templates: signal(TEMPLATES),
      templatePrompts: prompts,
      templatePromptLoading: signal<ReadonlySet<string>>(new Set()),
      loadTemplatePrompt: vi.fn(async () => undefined),
      saveTemplatePrompt: vi.fn(async () => undefined),
      resetTemplatePrompt: vi.fn(async () => undefined),
      error,
    } as unknown as MeetingsFacade;
    return TestBed.runInInjectionContext(() => createSkillEditorControls(facade));
  };

  it('lists the skills without any meeting', () => {
    const controls = setup();

    expect(controls.options().map((option) => option.name)).toEqual(['key-points']);
  });

  it('opens a skill on its built-in prompt and loads the saved one', () => {
    const controls = setup();

    controls.onOpen('key-points');

    expect(controls.open()).toBe('key-points');
    expect(controls.effective()).toBe('BUILT-IN {transcript}');
    expect(controls.label()).toContain('Key Points');
  });

  it('shows the edited prompt when there is one', () => {
    const controls = setup({ 'key-points': 'MINE {transcript}' });

    controls.onOpen('key-points');

    expect(controls.effective()).toBe('MINE {transcript}');
  });

  it('closes after a successful save', async () => {
    const controls = setup();
    controls.onOpen('key-points');

    controls.onSaved('NEW {transcript}');
    await Promise.resolve();
    await Promise.resolve();

    expect(controls.open()).toBeNull();
  });

  it('stays open and shows the failure when the save is refused', async () => {
    const controls = setup({}, { source: 'saveTemplatePrompt', message: 'needs {transcript}' });
    controls.onOpen('key-points');

    controls.onSaved('NEW');
    await Promise.resolve();
    await Promise.resolve();

    expect(controls.open()).toBe('key-points');
    expect(controls.error()).toBe('needs {transcript}');
  });

  it('closes without saving on cancel', () => {
    const controls = setup();
    controls.onOpen('key-points');

    controls.onClose();

    expect(controls.open()).toBeNull();
  });
});
