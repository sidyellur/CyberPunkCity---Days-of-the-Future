import * as THREE from 'three';

// A shared, mipmapped surface sample in metres keeps panel joints, fasteners and
// runoff at architectural scale on merged meshes with radically different UVs.
let finish: THREE.CanvasTexture | undefined;
function claddingSample() {
  if (finish) return finish;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d')!;
  let seed = 2250;
  function rand() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  const grain = g.createImageData(256, 256);
  for (let i = 0; i < grain.data.length; i += 4) {
    const n = 209 + rand() * 35;
    grain.data.set([n, n, n, 255], i);
  }
  g.putImageData(grain, 0, 0);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
    const x = col * 64, y = row * 128;
    g.fillStyle = 'rgba(32,42,44,' + (0.04 + rand() * 0.12) + ')';
    g.fillRect(x, y, 64, 128);
    g.fillStyle = '#666f70'; g.fillRect(x, y, 1, 128); g.fillRect(x, y, 64, 1);
    for (const dx of [4, 59]) for (const dy of [5, 121]) {
      g.fillStyle = '#78817e'; g.fillRect(x+dx, y+dy, 2, 2);
      const tail = 4 + rand() * 26;
      const streak = g.createLinearGradient(0, y+dy, 0, y+dy+tail);
      streak.addColorStop(0, '#36424765'); streak.addColorStop(1, '#36424700');
      g.fillStyle = streak; g.fillRect(x+dx, y+dy+2, 2.5, Math.min(tail, 126-dy));
    }
  }
  finish = new THREE.CanvasTexture(canvas);
  finish.wrapS = finish.wrapT = THREE.RepeatWrapping;
  finish.anisotropy = 4;
  return finish;
}

export function clad(material: THREE.MeshStandardMaterial) {
  const sample = claddingSample();
  material.onBeforeCompile = shader => {
    shader.uniforms.claddingMap = { value: sample };
    shader.vertexShader = 'varying vec3 panelP, panelN;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n panelP = position; panelN = normal;');
    shader.fragmentShader = 'varying vec3 panelP, panelN; uniform sampler2D claddingMap;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>', `#include <color_fragment>
        vec3 weights = pow(abs(normalize(panelN)), vec3(6.0));
        weights /= max(dot(weights, vec3(1.0)), 0.001);
        float finishValue = dot(weights, vec3(texture2D(claddingMap, panelP.zy / 12.0).r,
          texture2D(claddingMap, panelP.xz / 12.0).r, texture2D(claddingMap, panelP.xy / 12.0).r));
        diffuseColor.rgb *= mix(0.43, 1.15, finishValue);`
    ).replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor + 0.23 * (finishValue - 0.7), 0.17, 1.0);');
  };
  return material;
}
