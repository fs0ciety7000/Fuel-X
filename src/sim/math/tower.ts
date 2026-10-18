// Tower geometry (5.0): carriage height = f(pin height). The catch points on the closed arms sit at carriage height,
// so the carriage goes to wherever the stage's pins are (ASSETS_GUIDE sockets; `_stack.png` checks the same sums).
import { tower as td, vehicles } from '@data/index';

const { pins, carriage, qdArm } = td;

export const clampCarriageM = (m: number): number => Math.min(carriage.maxM, Math.max(carriage.minM, m));

/** Carriage height that puts the catch points on the booster catch pins, booster origin at `boosterOriginM`, m. */
export function carriageForBoosterM(boosterOriginM: number): number {
  return clampCarriageM(boosterOriginM + pins.boosterCatchPinM);
}

/** Carriage height that puts the catch points on the ship lift pins, ship origin at `shipOriginM`, m. */
export function carriageForShipM(shipOriginM: number): number {
  return clampCarriageM(shipOriginM + pins.shipLiftPinM);
}

/** Booster on the mount: 20 + 66 = 86 m (= carriage rest). */
export const CARRIAGE_STACK_BOOSTER_M = carriageForBoosterM(pins.mountDeckM);
/** Ship on the booster on the mount: 20 + 71 + 44 = 135 m (= carriage max). */
export const CARRIAGE_STACK_SHIP_M = carriageForShipM(pins.mountDeckM + vehicles.booster.heightM);

/** Strictly inside the QD keep-out band (the edges are allowed). */
export const inQdKeepOut = (m: number): boolean => m > qdArm.keepOutLoM && m < qdArm.keepOutHiM;
