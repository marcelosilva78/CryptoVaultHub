import { copyToClipboard } from './clipboard';

describe('copyToClipboard', () => {
  it('writes text via navigator.clipboard.writeText and returns true on success', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(global, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
    });

    const ok = await copyToClipboard('hello');
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(ok).toBe(true);
  });

  it('returns false when navigator.clipboard is unavailable', async () => {
    Object.defineProperty(global, 'navigator', {
      value: {},
      configurable: true,
    });
    const ok = await copyToClipboard('hello');
    expect(ok).toBe(false);
  });

  it('returns false when writeText rejects', async () => {
    Object.defineProperty(global, 'navigator', {
      value: { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) } },
      configurable: true,
    });
    const ok = await copyToClipboard('hello');
    expect(ok).toBe(false);
  });
});
