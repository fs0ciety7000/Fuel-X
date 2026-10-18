// Go/No-Go stations (GDD §4.5). Data only.
export type Station = 'WEATHER' | 'RANGE' | 'PROPELLANT' | 'VEHICLE' | 'PAD_CREW';
export const STATION_IDS: readonly Station[] = ['WEATHER', 'RANGE', 'PROPELLANT', 'VEHICLE', 'PAD_CREW'];
