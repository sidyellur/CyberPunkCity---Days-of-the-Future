import * as THREE from 'three';

// Reuse one sky for the backdrop and the environment lighting. Sampling directions
// on a sphere keeps the cloud field continuous at the panorama seam.
export function createStormSky() {
  const width = 768, height = 384;
  const pixels = new Uint8Array(width * height * 4);
  const noise = new Float32Array(256 * 256);
  let seed = 703;
  for (let i = 0; i < noise.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    noise[i] = seed / 4294967296;
  }
  const mix = THREE.MathUtils.lerp;
  const smooth = THREE.MathUtils.smoothstep;
  function sample(x: number, z: number) {
    const a = Math.floor(x), b = Math.floor(z);
    const u = smooth(x - a, 0, 1), v = smooth(z - b, 0, 1);
    const i = (b & 255) * 256, j = ((b + 1) & 255) * 256;
    return mix(mix(noise[i + (a & 255)], noise[i + ((a + 1) & 255)], u),
      mix(noise[j + (a & 255)], noise[j + ((a + 1) & 255)], u), v);
  }
  function clouds(x: number, z: number) {
    return sample(x, z) * 0.48 + sample(x * 2.1 + 9, z * 2.1) * 0.27
      + sample(x * 4.5, z * 4.5 + 29) * 0.15 + sample(x * 9, z * 9) * 0.07
      + sample(x * 19, z * 19) * 0.03;
  }
  for (let y = 0; y < height; y++) {
    const latitude = ((y + 0.5) / height - 0.5) * Math.PI;
    const up = Math.sin(latitude), radius = Math.cos(latitude);
    for (let x = 0; x < width; x++) {
      const longitude = ((x + 0.5) / width - 0.5) * Math.PI * 2;
      const dx = Math.cos(longitude) * radius, dz = Math.sin(longitude) * radius;
      const h = Math.max(0, up), zenith = Math.pow(h, 0.55);
      const warm = Math.pow(Math.max(0, -0.91 * dx - 0.39 * dz + 0.14 * up), 7) * Math.exp(-3.2 * h);
      const skyR = mix(137, 35, zenith) + warm * 95;
      const skyG = mix(151, 57, zenith) + warm * 38;
      const skyB = mix(157, 76, zenith) - warm * 17;
      const cx = dx * 3.2 / (h + 0.095) + 41, cz = dz * 3.2 / (h + 0.095) + 13;
      const density = clouds(cx, cz);
      const cover = smooth(density, 0.38, 0.68) * smooth(up, 0.014, 0.18) * 0.73;
      const rim = Math.max(0, clouds(cx - 0.32, cz - 0.10) - density);
      const low = 1 - smooth(up, -0.24, 0.015);
      const i = (y * width + x) * 4;
      pixels[i] = mix(mix(skyR, 44 + rim * 158 + warm * 76, cover), 18, low);
      pixels[i+1] = mix(mix(skyG, 58 + rim * 122 + warm * 34, cover), 26, low);
      pixels[i+2] = mix(mix(skyB, 70 + rim * 99 + warm * 12, cover), 31, low);
      pixels[i+3] = 255;
    }
  }
  const sky = new THREE.DataTexture(pixels, width, height);
  sky.mapping = THREE.EquirectangularReflectionMapping;
  sky.colorSpace = THREE.SRGBColorSpace;
  sky.magFilter = sky.minFilter = THREE.LinearFilter;
  sky.needsUpdate = true;
  return sky;
}
