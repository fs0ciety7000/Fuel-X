// Asset geometry the sim positions entities by (5.0b). Mirrors the socket heights in docs/ASSETS_GUIDE.md §4 (sockets
// are an API: change the Blender script, the guide and this block in the same commit). SI: m.
//
// Convention: an entity's `pos` is its asset origin in site-local world metres (ARCHITECTURE §6). Render places the
// GLB at `pos` as-is: no attachment lift. So a stage on the launch mount has y = `pad.vehicleMountM`, a ship on the
// stack y = mount + `booster.shipMountM`, a stage on a transporter y = transporter y + `transporter.cargoM`.

export const siteGeometry = {
  pad: {
    /** PAD `SOCKET_VehicleMount` (deck centre, (0, 0, 20)) = BOOSTER origin on OLM-1, m above the pad origin. */
    vehicleMountM: 20,
  },
  booster: {
    /** BOOSTER `SOCKET_CatchPinL/R` ((±5.4, 0, 66), pin lower face) above the booster origin, m. */
    catchPinM: 66,
    /** BOOSTER `SOCKET_ShipMount` ((0, 0, 71), top of the hot-stage ring) = SHIP origin, m above the booster origin. */
    shipMountM: 71,
  },
  ship: {
    /** SHIP `SOCKET_LiftPinL/R` ((±5.4, 0, 44)) above the ship origin, m. */
    liftPinM: 44,
  },
  transporter: {
    /** TRANSPORTER `SOCKET_Cargo` (stand top centre, world z 4.6 at deck rest) = stage origin on the deck, m. */
    cargoM: 4.6,
  },
  tower: {
    /**
     * TOWER `TOWER_Carriage` height for the tower catch, m above the tower base (5.0). The catch points sit at
     * carriage height, so the booster origin at the catch is `catchCarriageM − booster.catchPinM` = 60 m
     * (`site-lc1.points.catchPoint`, flightProfile CATCH altitude).
     */
    catchCarriageM: 126,
  },
};

/** Booster origin height at the tower catch, m above site ground (126 − 66 = 60). */
export const CATCH_ORIGIN_M = siteGeometry.tower.catchCarriageM - siteGeometry.booster.catchPinM;
