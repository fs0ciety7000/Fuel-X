import { describe, expect, it } from 'vitest';
import { share } from './share';

describe('structural sharing', () => {
  it('returns prev when deep-equal', () => {
    const prev = { a: 1, b: { c: [1, 2, { d: 'x' }] } };
    const next = { a: 1, b: { c: [1, 2, { d: 'x' }] } };
    expect(share(prev, next)).toBe(prev);
  });

  it('keeps unchanged rows by id and replaces only the changed one', () => {
    const prev = {
      rows: [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
        { id: 'c', v: 3 },
      ],
      t: 1,
    };
    const next = {
      rows: [
        { id: 'a', v: 1 },
        { id: 'b', v: 5 },
        { id: 'c', v: 3 },
      ],
      t: 2,
    };
    const out = share(prev, next);
    expect(out).not.toBe(prev);
    expect(out.rows[0]).toBe(prev.rows[0]);
    expect(out.rows[1]).not.toBe(prev.rows[1]);
    expect(out.rows[2]).toBe(prev.rows[2]);
  });

  it('matches rows by id across insertions', () => {
    const prev = {
      rows: [
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
      ],
    };
    const next = {
      rows: [
        { id: 'z', v: 0 },
        { id: 'a', v: 1 },
        { id: 'b', v: 2 },
      ],
    };
    const out = share(prev, next);
    expect(out.rows[1]).toBe(prev.rows[0]);
    expect(out.rows[2]).toBe(prev.rows[1]);
  });

  it('detects removed keys and length changes', () => {
    expect(share({ a: 1, b: 2 } as Record<string, number>, { a: 1 })).toEqual({ a: 1 });
    const prev = { xs: [1, 2, 3] };
    expect(share(prev, { xs: [1, 2] }).xs).toEqual([1, 2]);
  });

  it('does not write into frozen inputs when children are equal', () => {
    const frozen = Object.freeze([1, 2, 3]);
    expect(() => share({ xs: [1, 2, 4] }, { xs: frozen as unknown as number[] })).not.toThrow();
  });
});
