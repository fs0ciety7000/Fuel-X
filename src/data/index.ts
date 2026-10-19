// Tunables, names and site layouts (docs/BALANCING.md, GDD §5/§12/§13). Data only, no logic.
// Conventions: SI units (m, s, kg, m/s, kg/s, K, Pa); unit in the key name (`loadRateKgPerS`);
// `…TS` = signed T-clock offset in seconds (negative before liftoff); money in cr.
export * from './anomalies';
export * from './catch';
export * from './contracts';
export * from './countdown';
export * from './economy';
export * from './flightProfile';
export * from './logistics';
export * from './names';
export * from './propellant';
export * from './site-lc1';
export * from './siteGeometry';
export * from './stations';
export * from './time';
export * from './tower';
export * from './vehicles';
export * from './weather';
