// Deterministic simulation (pure TS) — public API. See ARCHITECTURE §3–§7, ADR 0003.
export { SIM_TICK_HZ, DT_S, secondsToTicks, ticksToSeconds } from './core/time';
export { createWorld, countdownIds, WORLD_SCHEMA } from './core/world';
export type { CreateWorldOptions } from './core/world';
export { RNG_STREAMS, rng, rngFromState, seedStream, seedAllStreams, sfc32Next } from './core/rng';
export type { Rng } from './core/rng';
export { defineFsm } from './core/fsm';
export type { Fsm, FsmContext, FsmDefinition, FsmTransition } from './core/fsm';
export { emit, drainEvents, eventsThisTick } from './core/events';
export { createCommandQueue, enqueueCommand, takeCommands } from './core/commands';
export type { CommandQueue } from './core/commands';
export { canonicalStringify, serializeWorld, deserializeWorld, hashWorld } from './core/serialize';
export { hashHex } from './core/hash';
export { spawnEntity, despawnEntity, getEntity, entitiesOfKind, findByCallSign, formatEntityId } from './core/entities';
export type { EntitySpec } from './core/entities';
export { step, advance, SYSTEMS } from './step';
export type { SimSystem, StepContext } from './step';
export {
  STATIONS,
  PHASES,
  PRE_LIFTOFF_PHASES,
  createCountdown,
  defaultCountdownInputs,
  isPreLiftoff,
  maxTimeScale,
  phaseFsm,
  clockFsm,
  releaseBlocker,
} from './systems/countdown';
export type { CreateCountdownOptions, PhaseTrigger, ClockTrigger } from './systems/countdown';
export type * from './types';
export { spawnSiteLayout } from './entities/site';
export { boosterFsm, shipFsm, tankerFsm } from './entities/machines';
export { pathLengthM, pointAt, headingOf, headingToQuat } from './math/path';
export { roadShouldBeClosed } from './systems/logistics';
export {
  addToFarm,
  drawFromFarm,
  farmFreeKg,
  farmMassKg,
  farmUsableKg,
  stageFull,
  toppingDemandKgPerS,
} from './systems/propellant';
export { createMvpFlight } from './entities/flight';
export { craneFsm, setArms, towerFsm, transporterFsm } from './entities/machines';
