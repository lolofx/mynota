import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CaptureSource, SystemAudioStatus } from '../../core/models/capture-source.model';
import type { RecordingState } from '../../core/models/recording-state.model';
import { MeetingsStore } from '../stores/meetings.store';
import { CheckSystemAudioUseCase } from '../use-cases/check-system-audio.usecase';
import {
  SYSTEM_AUDIO_GRACE_MS,
  SystemAudioGuardFacade,
  systemAudioRequired,
  systemAudioUnavailable,
} from './system-audio-guard.facade';

describe('system audio guard pure rules', () => {
  it('requires system audio for system and mixed, never for microphone', () => {
    expect(systemAudioRequired('microphone')).toBe(false);
    expect(systemAudioRequired('system')).toBe(true);
    expect(systemAudioRequired('mixed')).toBe(true);
  });

  it('treats permission_denied and unavailable as blocking, available and unknown as not', () => {
    expect(systemAudioUnavailable({ kind: 'permission_denied', restartRequired: false })).toBe(true);
    expect(systemAudioUnavailable({ kind: 'unavailable', reason: 'no tap' })).toBe(true);
    expect(systemAudioUnavailable({ kind: 'available' })).toBe(false);
    expect(systemAudioUnavailable({ kind: 'unknown' })).toBe(false);
    expect(systemAudioUnavailable(undefined)).toBe(false);
  });
});

describe('SystemAudioGuardFacade', () => {
  const recordingState = signal<RecordingState>('idle');
  const captureSource = signal<CaptureSource>('mixed');
  const effectiveSystemSource = signal<unknown>(null);
  const systemAudioStatus = signal<SystemAudioStatus | undefined>(undefined);
  const setSystemAudioStatus = vi.fn((status: SystemAudioStatus) => systemAudioStatus.set(status));
  const checkStatus = vi.fn<() => Promise<SystemAudioStatus>>();

  const fakeStore = {
    recordingState,
    captureSource,
    effectiveSystemSource,
    systemAudioStatus,
    setSystemAudioStatus,
  };

  const flush = () => TestBed.tick();

  beforeEach(() => {
    vi.useFakeTimers();
    recordingState.set('idle');
    captureSource.set('mixed');
    effectiveSystemSource.set(null);
    systemAudioStatus.set(undefined);
    setSystemAudioStatus.mockClear();
    checkStatus.mockReset();
    TestBed.configureTestingModule({
      providers: [
        SystemAudioGuardFacade,
        { provide: MeetingsStore, useValue: fakeStore },
        { provide: CheckSystemAudioUseCase, useValue: { status: checkStatus } },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('refuses to start when system audio is denied, and shows the start block', async () => {
    checkStatus.mockResolvedValue({ kind: 'permission_denied', restartRequired: false });
    const guard = TestBed.inject(SystemAudioGuardFacade);

    expect(await guard.allowStart()).toBe(false);
    expect(guard.block()).toBe('start-refused');
    expect(setSystemAudioStatus).toHaveBeenCalledWith({ kind: 'permission_denied', restartRequired: false });
  });

  it('runs the start only when system audio is available', async () => {
    const guard = TestBed.inject(SystemAudioGuardFacade);
    const start = vi.fn(async () => undefined);

    checkStatus.mockResolvedValueOnce({ kind: 'unavailable', reason: 'no tap' });
    await guard.startGuarded(start);
    expect(start).not.toHaveBeenCalled();

    checkStatus.mockResolvedValueOnce({ kind: 'available' });
    await guard.startGuarded(start);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('lets microphone-only recordings start without checking system audio', async () => {
    captureSource.set('microphone');
    const guard = TestBed.inject(SystemAudioGuardFacade);

    expect(await guard.allowStart()).toBe(true);
    expect(checkStatus).not.toHaveBeenCalled();
    expect(guard.block()).toBeNull();
  });

  it('lets the start proceed when system audio is available', async () => {
    checkStatus.mockResolvedValue({ kind: 'available' });
    const guard = TestBed.inject(SystemAudioGuardFacade);

    expect(await guard.allowStart()).toBe(true);
    expect(guard.block()).toBeNull();
  });

  it('lets the start proceed when the check itself fails (the mid-recording check still covers it)', async () => {
    checkStatus.mockRejectedValue(new Error('ipc down'));
    const guard = TestBed.inject(SystemAudioGuardFacade);

    expect(await guard.allowStart()).toBe(true);
    expect(guard.block()).toBeNull();
  });

  it('blocks a recording whose system track never appears after the grace period', () => {
    const guard = TestBed.inject(SystemAudioGuardFacade);
    recordingState.set('recording');
    flush();

    expect(guard.block()).toBeNull();
    vi.advanceTimersByTime(SYSTEM_AUDIO_GRACE_MS);
    expect(guard.block()).toBe('lost-during-recording');
  });

  it('does not block when the system source is announced within the grace period', () => {
    const guard = TestBed.inject(SystemAudioGuardFacade);
    recordingState.set('recording');
    flush();
    vi.advanceTimersByTime(SYSTEM_AUDIO_GRACE_MS - 1);
    effectiveSystemSource.set({ id: 'all', name: 'Tous' });
    flush();
    vi.advanceTimersByTime(SYSTEM_AUDIO_GRACE_MS);

    expect(guard.block()).toBeNull();
  });

  it('never blocks a microphone-only recording', () => {
    captureSource.set('microphone');
    const guard = TestBed.inject(SystemAudioGuardFacade);
    recordingState.set('recording');
    flush();
    vi.advanceTimersByTime(SYSTEM_AUDIO_GRACE_MS * 2);

    expect(guard.block()).toBeNull();
  });

  it('clears the lost-capture block once the recording stops, but keeps a start refusal', async () => {
    const guard = TestBed.inject(SystemAudioGuardFacade);
    recordingState.set('recording');
    flush();
    vi.advanceTimersByTime(SYSTEM_AUDIO_GRACE_MS);
    expect(guard.block()).toBe('lost-during-recording');

    recordingState.set('stopping');
    flush();
    expect(guard.block()).toBeNull();

    checkStatus.mockResolvedValue({ kind: 'unavailable', reason: 'no tap' });
    expect(await guard.allowStart()).toBe(false);
    recordingState.set('idle');
    flush();
    expect(guard.block()).toBe('start-refused');
  });
});
