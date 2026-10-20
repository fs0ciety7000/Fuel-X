// The render ↔ world-HUD DOM contract is declared twice (src/ui and src/render cannot import each other, ARCHITECTURE
// §2): both copies must stay identical.
import { describe, expect, it } from 'vitest';
import * as render from '../../src/render/dom-contract';
import * as ui from '../../src/ui/hud/world/dom-contract';

describe('world HUD DOM contract', () => {
  it('render and ui declare the same attributes, event and constants', () => {
    expect(ui).toEqual(render);
  });
});
