// 8.2: the session port's synchronous `rateState()` and the projected `timeScale` share one mapping (`rateFields`).
import { describe, expect, it } from 'vitest';
import { rateFields } from './project';

describe('rateFields', () => {
  it('prints paused as requested 0 and keeps the running request as resumeRate', () => {
    expect(rateFields({ paused: false, requested: 10 }, false)).toEqual({
      paused: false,
      requested: 10,
      resumeRate: 10,
    });
    expect(rateFields({ paused: true, requested: 100 }, false)).toEqual({
      paused: true,
      requested: 0,
      resumeRate: 100,
    });
  });

  it('a finished run reads as paused whatever the time control holds', () => {
    expect(rateFields({ paused: false, requested: 10 }, true)).toEqual({ paused: true, requested: 0, resumeRate: 10 });
  });
});
