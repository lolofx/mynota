/**
 * Why the blocking system-audio dialog is shown: refused before any capture
 * started, or lost while a recording was running (the backend fell back to
 * the microphone).
 */
export type SystemAudioBlock = 'start-refused' | 'lost-during-recording';
