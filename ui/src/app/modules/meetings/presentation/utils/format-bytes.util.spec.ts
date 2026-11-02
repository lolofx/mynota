import { formatBytes } from './format-bytes.util';

describe('formatBytes', () => {
  it('uses the largest fitting unit with at most one decimal', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1.2 * 1024 ** 3)).toBe('1.2 GB');
    expect(formatBytes(340 * 1024 ** 2)).toBe('340 MB');
  });

  it('treats negatives as zero', () => {
    expect(formatBytes(-5)).toBe('0 B');
  });
});
