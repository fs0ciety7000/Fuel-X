// UI projection (ARCHITECTURE §8): pure projector + the throttled runner the composition root drives.
export { projectUi, lockReason } from './project';
export type { ProjectEnv } from './project';
export { Projector, PROJECTION_INTERVAL_MS } from './projector';
export type { ProjectorDeps, ProjectorStats } from './projector';
export { SparkSampler, SPARK_SAMPLES } from './spark';
export { EventLog, SALIENT_EVENTS, describeEvent } from './event-log';
export { UTC_AT_TICK0_S } from './context';
export type { TimeInputs } from './context';
