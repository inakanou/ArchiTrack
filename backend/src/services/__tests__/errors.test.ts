import { describe, it, expect } from 'vitest';
import { ThumbnailRegenerationError } from '../errors.js';

describe('ThumbnailRegenerationError', () => {
  it('sets name, code, and message correctly', () => {
    const err = new ThumbnailRegenerationError('regeneration failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ThumbnailRegenerationError);
    expect(err.name).toBe('ThumbnailRegenerationError');
    expect(err.code).toBe('THUMBNAIL_REGENERATION_FAILED');
    expect(err.message).toBe('regeneration failed');
  });

  it('propagates the cause option', () => {
    const original = new Error('sharp crashed');
    const err = new ThumbnailRegenerationError('regeneration failed', {
      cause: original,
    });
    expect(err.cause).toBe(original);
  });

  it('is throwable and catchable as ThumbnailRegenerationError', () => {
    expect(() => {
      throw new ThumbnailRegenerationError('boom');
    }).toThrow(ThumbnailRegenerationError);

    try {
      throw new ThumbnailRegenerationError('boom', { cause: 'reason' });
    } catch (e) {
      expect(e).toBeInstanceOf(ThumbnailRegenerationError);
      if (e instanceof ThumbnailRegenerationError) {
        expect(e.code).toBe('THUMBNAIL_REGENERATION_FAILED');
        expect(e.cause).toBe('reason');
      }
    }
  });
});
