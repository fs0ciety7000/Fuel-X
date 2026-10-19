import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { APP_VERSION } from './version';

describe('APP_VERSION', () => {
  it('equals package.json version', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });
});
