// TOWER-1 mechanisms (BALANCING §14, ASSETS_GUIDE §4 TOWER/PAD/BOOSTER/SHIP). SI: m, m/s, rad, rad/s.
// Heights are above the tower base (= site ground, y 0). Geometry mirrors the Blender scripts (sockets are an
// API: change both together); rates are sim additions 5.0 (review).

const DEG = Math.PI / 180;

export const tower = {
  carriage: {
    /** `TOWER_Carriage` travel, m (blender/assets/tower.py CARRIAGE_MIN/MAX/REST). */
    minM: 25,
    maxM: 135,
    /** Start height = booster catch pins with the booster on the mount (20 + 66), m. */
    restM: 86,
    /** Sim addition 5.0 (review): carriage hoist speed, m/s (rest → ship stacking 49 m ≈ 49 s). */
    speedMPerS: 1,
  },
  arms: {
    /** `TOWER_ArmL` opens to +openRad, `TOWER_ArmR` to −openRad; 0 = closed, rad (ARM_OPEN_DEG 40). */
    openRad: 40 * DEG,
    /** Sim addition 5.0 (review): arm swing rate, rad/s (8°/s → 5 s open ⇄ closed). */
    rateRadPerS: 8 * DEG,
  },
  qdArm: {
    /** `TOWER_QDArm` hinge height, m (QD_HEIGHT). */
    hingeM: 100,
    /** 0 = stowed (swung out to the R side), engagedRad = on the ship QD plate, rad. */
    engagedRad: 90 * DEG,
    /** Sim addition 5.0 (review): QD arm swing rate, rad/s (9°/s → 10 s stow ⇄ engage). */
    rateRadPerS: 9 * DEG,
    /**
     * Carriage keep-out band while the QD arm is not stowed, m (ASSETS_GUIDE TOWER as-built: the QD arm at 100 m
     * blocks the carriage/arm path). The carriage may sit on an edge, never strictly inside.
     */
    keepOutLoM: 92,
    keepOutHiM: 106,
  },
  pins: {
    /** PAD `SOCKET_VehicleMount` height = booster origin on the mount, m. */
    mountDeckM: 20,
    /** BOOSTER `SOCKET_CatchPinL/R` above the booster origin, m. */
    boosterCatchPinM: 66,
    /** SHIP `SOCKET_LiftPinL/R` above the ship origin, m (ship origin = booster origin + booster height). */
    shipLiftPinM: 44,
  },
};
