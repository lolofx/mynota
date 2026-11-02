import { Injectable, computed, inject, signal } from '@angular/core';

import { VocabularyPort } from '../../core/ports/vocabulary.port';

/**
 * The user's vocabulary (trade terms, abbreviations, names the speech model
 * gets wrong). Never optimistic: `saved` changes only once the backend kept
 * the text. Provided at the route injector, never `providedIn: 'root'`.
 */
@Injectable()
export class VocabularyFacade {
  private readonly port = inject(VocabularyPort);

  private readonly savedState = signal<string | undefined>(undefined);
  private readonly draftState = signal('');
  private readonly correctedState = signal<number | null>(null);
  private readonly errorState = signal<string | null>(null);
  private readonly workingState = signal(false);

  /** The text the backend holds; `undefined` until loaded. */
  readonly saved = this.savedState.asReadonly();
  /** The text being edited. */
  readonly draft = this.draftState.asReadonly();
  /** Segments corrected by the last "apply to meetings"; `null` before one. */
  readonly corrected = this.correctedState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly working = this.workingState.asReadonly();
  /** True when the draft differs from what is saved. */
  readonly dirty = computed(() => this.savedState() !== undefined && this.draftState() !== this.savedState());

  load(): Promise<void> {
    return this.run(async () => {
      const text = await this.port.get();
      this.savedState.set(text);
      this.draftState.set(text);
    });
  }

  edit(text: string): void {
    this.draftState.set(text);
  }

  save(): Promise<void> {
    return this.run(async () => {
      await this.port.set(this.draftState());
      this.savedState.set(this.draftState());
    });
  }

  /** Saves any pending edit, then applies the vocabulary to the meetings already transcribed. */
  applyToMeetings(): Promise<void> {
    return this.run(async () => {
      if (this.dirty()) {
        await this.port.set(this.draftState());
        this.savedState.set(this.draftState());
      }
      this.correctedState.set(await this.port.applyToMeetings());
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.workingState.set(true);
    this.errorState.set(null);
    try {
      await action();
    } catch (error) {
      this.errorState.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.workingState.set(false);
    }
  }
}
