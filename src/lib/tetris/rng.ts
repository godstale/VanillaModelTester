import { KIND_ORDER } from './constants';
import type { BagState, PieceKind } from './types';

/** Deterministic PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stateless single step of the same generator so the evolving RNG state
// can live inside the serializable BagState instead of a closure.
function nextRandom(state: number): { value: number; state: number } {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: a };
}

export function createBagState(seed: number): BagState {
  return { rngState: seed, bag: [], index: 0 };
}

export function drawFromBag(bag: BagState): {
  piece: PieceKind;
  bag: BagState;
} {
  if (bag.index < bag.bag.length) {
    return {
      piece: bag.bag[bag.index],
      bag: { rngState: bag.rngState, bag: bag.bag, index: bag.index + 1 },
    };
  }
  const fresh: PieceKind[] = [...KIND_ORDER];
  let state = bag.rngState;
  for (let i = fresh.length - 1; i > 0; i--) {
    const step = nextRandom(state);
    state = step.state;
    const j = Math.floor(step.value * (i + 1));
    const tmp = fresh[i];
    fresh[i] = fresh[j];
    fresh[j] = tmp;
  }
  return { piece: fresh[0], bag: { rngState: state, bag: fresh, index: 1 } };
}
