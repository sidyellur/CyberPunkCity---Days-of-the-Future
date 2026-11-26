export type DistrictProfile = 'transit' | 'market' | 'industrial' | 'residential';
type Lot = [x: number, z: number, w: number, d: number];

export const PROFILES = {
  transit: {
    palette: [0x53aebd, 0x8ccee5, 0x577a97],
    cell: [4.4, 3.5], park: 0.18, trim: 0.36, signs: 0.18, antenna: 0.18,
  },
  market: {
    palette: [0xbc7758, 0xc99b66, 0xa65d7c],
    cell: [3.25, 3.2], park: 0.55, trim: 0.22, signs: 0.8, antenna: 0.07,
  },
  industrial: {
    palette: [0x957457, 0xb38d53, 0x6d918c],
    cell: [6.8, 3.9], park: 0.15, trim: 0.13, signs: 0.04, antenna: 0.02,
  },
  residential: {
    palette: [0x6c9d89, 0x959974, 0xa79883],
    cell: [3.8, 3.3], park: 1.55, trim: 0.15, signs: 0.16, antenna: 0.09,
  },
} satisfies Record<DistrictProfile, {
  palette: number[];
  cell: [number, number];
  park: number;
  trim: number;
  signs: number;
  antenna: number;
}>;

export function profileAt(bx: number, bz: number): DistrictProfile {
  if ((bx < 2 && bz >= 3) || (bx === 3 && bz >= 7)) return 'industrial';
  if (bx >= 6 && (bz >= 3 || bx >= 8 && bz >= 1)) return 'transit';
  if (bx >= 3 && bx <= 5 && bz >= 5) return 'market';
  return 'residential';
}

export function profileLots(profile: DistrictProfile, x: number, z: number, inner: number, rng: () => number): Lot[] {
  const roll = rng();
  const alongX = rng() < 0.5;
  const quarter = inner / 4;
  if (profile === 'industrial') {
    return roll < 0.58 ? [[x, z, inner, inner * 0.73]]
      : [[x - quarter, z, inner / 2 - 3, inner * 0.8], [x + quarter, z, inner / 2 - 3, inner * 0.8]];
  }
  if (profile === 'transit' && roll < 0.24) {
    return [[x, z, inner * 0.86, inner * 0.86]];
  }
  if ((profile === 'transit' && roll < 0.78) || (profile === 'residential' && roll < 0.53) || roll < 0.23) {
    const courtyard = profile === 'residential' ? 5 : 3;
    const width = inner / 2 - courtyard;
    return alongX ? [[x - quarter, z, width, inner - 7], [x + quarter, z, width, inner - 7]]
      : [[x, z - quarter, inner - 7, width], [x, z + quarter, inner - 7, width]];
  }
  const size = inner / 2 - 3;
  return [[x - quarter, z - quarter, size, size], [x + quarter, z - quarter, size, size],
    [x - quarter, z + quarter, size, size], [x + quarter, z + quarter, size, size]];
}

export function profileHeight(profile: DistrictProfile, bx: number, bz: number, rng: () => number): number {
  const roll = rng();
  switch (profile) {
    case 'transit': {
      if (bz === 8) return 21 + roll * 26;
      const distance = Math.hypot(bx - 6.7, bz - 5.4);
      const centre = Math.max(0, 1 - distance * 0.21);
      return 52 + 65 * centre + roll ** 1.55 * (110 + 90 * centre);
    }
    case 'market':
      return (bz >= 7 ? 30 : 40) + roll * (roll > 0.92 ? 78 : 43);
    case 'industrial':
      return 10 + roll * (roll > 0.9 ? 31 : 18);
    case 'residential':
      return 32 + roll * (roll > 0.85 ? 89 : 59);
  }
}
