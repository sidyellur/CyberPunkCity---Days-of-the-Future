// The shared 3D stage: sky, haze, streets, traffic, rain, the Architect, cameras and glow.
// The visual slice and the game both put their districts on this.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  BLOCKS, BLOCK, PITCH, ORIGIN, EXTENT, GROUND_TILES, MID, Shared, Structure, createShared, lampSpots, mulberry,
} from './city';

const FOG = 0x24103f;

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  shared: Shared;
  canvas: HTMLCanvasElement;
  readonly walking: boolean;
  touch: boolean;
  glow: boolean;
  rain: THREE.Object3D;
  /** Held down by an on-screen button to walk forward on touch devices. */
  walkHold: boolean;
  setView(street: boolean): void;
  onView: (street: boolean) => void;
  /** Ground point under a screen position, or null when the ray misses the ground. */
  pick(clientX: number, clientY: number): { x: number; z: number } | null;
  /** Draw one frame. `rising` is what the drones should swarm; `busy` keeps the survey pulse going. */
  frame(dt: number, t: number, rising: Structure[], spire: Structure, spireTop: number, busy: boolean): void;
}

export function createStage(canvas: HTMLCanvasElement, reducedMotion: boolean): Stage | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    const el = document.createElement('div');
    el.className = 'fallback';
    el.textContent = 'This view needs WebGL, which this browser or device has switched off.';
    document.body.appendChild(el);
    return null;
  }
  const small = Math.min(innerWidth, innerHeight) < 600;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(FOG, 0.0015);
  scene.background = new THREE.Color(FOG);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 9000);
  camera.position.set(560, 250, 640);

  // Sky: a glow on the horizon fading to black overhead.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(7000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { low: { value: new THREE.Color(0x7a2f6a) }, mid: { value: new THREE.Color(FOG) }, high: { value: new THREE.Color(0x020308) } },
      vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 v; uniform vec3 low; uniform vec3 mid; uniform vec3 high;
        void main(){ float h = clamp(v.y, 0.0, 1.0);
          vec3 c = mix(low, mid, smoothstep(0.0, 0.11, h)); c = mix(c, high, smoothstep(0.08, 0.5, h));
          gl_FragColor = vec4(c, 1.0); }`,
    }),
  );
  scene.add(sky);

  // Light: mostly emissive surfaces, with two coloured washes for shape.
  scene.add(new THREE.HemisphereLight(0x4b3a8c, 0x06070c, 0.9));
  const wash1 = new THREE.DirectionalLight(0xff4d9d, 0.9); wash1.position.set(-1, 0.6, 0.4);
  const wash2 = new THREE.DirectionalLight(0x35c8ff, 0.7); wash2.position.set(0.8, 0.5, -1);
  scene.add(wash1, wash2);

  const shared = createShared();
  const rng = mulberry(4242);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_TILES * PITCH, GROUND_TILES * PITCH).rotateX(-Math.PI / 2), shared.ground);
  scene.add(ground);

  // A far skyline in the haze, for scale.
  {
    const farMat = shared.windows[1].clone();
    const farMap = farMat.map!.clone();
    farMap.repeat.set(2.5, 5); farMap.needsUpdate = true;
    farMat.map = farMat.emissiveMap = farMap;
    farMat.emissiveIntensity = 0.8;
    const far = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), farMat, 420);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < far.count; i++) {
      const a = rng() * Math.PI * 2, r = EXTENT * 0.75 + 260 + rng() * 2400;
      s.set(50 + rng() * 80, (120 + rng() * 420) * (1 - r / 4600), 50 + rng() * 80);
      p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      far.setMatrixAt(i, m.compose(p, q, s));
    }
    scene.add(far);
  }

  // Street lamps.
  {
    const spots = lampSpots();
    const n = (BLOCKS * BLOCKS - 1) * spots.length;
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 7, 0.25).translate(0, 3.5, 0), new THREE.MeshStandardMaterial({ color: 0x1a1d2a, roughness: 0.6 }), n);
    const heads = new Float32Array(n * 3);
    const m = new THREE.Matrix4();
    let i = 0;
    for (let bz = 0; bz < BLOCKS; bz++) for (let bx = 0; bx < BLOCKS; bx++) {
      if (bx === MID && bz === MID) continue;
      const cx = ORIGIN + (bx + 0.5) * PITCH, cz = ORIGIN + (bz + 0.5) * PITCH;
      for (const [lx, lz] of spots) {
        posts.setMatrixAt(i, m.makeTranslation(cx + lx, 0, cz + lz));
        heads.set([cx + lx, 7.2, cz + lz], i * 3);
        i++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(heads, 3));
    scene.add(posts, new THREE.Points(geo, new THREE.PointsMaterial({
      map: shared.sprite, color: new THREE.Color(0xffb070).multiplyScalar(2), size: 2.4, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    })));
  }

  // Air and street traffic: points of light running the street lines.
  const TRAFFIC = small ? 420 : 760;
  const trafficPos = new Float32Array(TRAFFIC * 3);
  const lanes: { axis: 0 | 1; line: number; y: number; speed: number; off: number }[] = [];
  const trafficSpan = EXTENT + 900;
  const trafficGeo = new THREE.BufferGeometry();
  {
    const col = new Float32Array(TRAFFIC * 3);
    const palette = [new THREE.Color(0xffffff), new THREE.Color(0xff4040), new THREE.Color(0xffb347), new THREE.Color(0x7de8ff)];
    const levels = [1.4, 48, 95, 150, 210];
    for (let i = 0; i < TRAFFIC; i++) {
      const dir = rng() < 0.5 ? 1 : -1;
      const level = Math.floor(rng() * levels.length);
      lanes.push({
        axis: rng() < 0.5 ? 0 : 1, line: ORIGIN + Math.floor(rng() * (BLOCKS + 1)) * PITCH + dir * 3.2,
        y: levels[level] + (rng() - 0.5) * (level ? 8 : 0), speed: dir * (level ? 30 + rng() * 45 : 9 + rng() * 9), off: rng() * trafficSpan,
      });
      const c = palette[dir > 0 ? (rng() < 0.7 ? 0 : 2) : (rng() < 0.7 ? 1 : 3)].clone().multiplyScalar(1.8);
      col.set([c.r, c.g, c.b], i * 3);
    }
    trafficGeo.setAttribute('position', new THREE.BufferAttribute(trafficPos, 3));
    trafficGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(trafficGeo, new THREE.PointsMaterial({
      map: shared.sprite, vertexColors: true, size: 6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
  }

  // Rain: streaks in a box that follows the camera.
  const RAIN = small ? 900 : 1800, RBOX = new THREE.Vector3(160, 110, 160);
  const rainPos = new Float32Array(RAIN * 6), rainSeed = new Float32Array(RAIN * 3);
  for (let i = 0; i < RAIN * 3; i++) rainSeed[i] = rng();
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9db8ff, transparent: true, opacity: 0.22, depthWrite: false }));
  rain.frustumCulled = false;
  scene.add(rain);

  // Construction drones.
  const DRONES = 260;
  const dronePos = new Float32Array(DRONES * 3);
  const droneGeo = new THREE.BufferGeometry();
  droneGeo.setAttribute('position', new THREE.BufferAttribute(dronePos, 3));
  const drones = new THREE.Points(droneGeo, new THREE.PointsMaterial({
    map: shared.sprite, color: new THREE.Color(0xffd28a).multiplyScalar(2), size: 4.5, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  drones.frustumCulled = false;
  scene.add(drones);

  // The Architect: beam, core and rings on the spire.
  const architect = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 5, 2600, 12, 1, true).translate(0, 1300, 0),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7df2ff).multiplyScalar(1.6), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }),
  );
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(9, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd8feff).multiplyScalar(2.4), toneMapped: false }));
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(26 + i * 12, 0.5, 6, 64),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(i === 1 ? 0xff3d8b : 0x2ee6ff).multiplyScalar(1.8), toneMapped: false }),
    );
    rings.push(ring);
    architect.add(ring);
  }
  core.position.y = 80;
  beam.position.y = 80;
  architect.add(beam, core);
  scene.add(architect);
  // A survey pulse sweeping out across the ground.
  const pulse = new THREE.Mesh(
    new THREE.RingGeometry(0.988, 1, 128).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2ee6ff).multiplyScalar(1.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
  );
  pulse.position.y = 0.4;
  scene.add(pulse);

  // Searchlights sweeping the haze.
  const beams: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(22, 1.2, 900, 16, 1, true).translate(0, 450, 0),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color([0x7de8ff, 0xff7ab8, 0xfff0c8][i % 3]), transparent: true, opacity: 0.07,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      }),
    );
    const a = (i / 7) * Math.PI * 2 + 0.4;
    cone.position.set(Math.cos(a) * 30, 300 + (i % 4) * 40, Math.sin(a) * 30);
    beams.push(cone);
    scene.add(cone);
  }

  // Glow.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Glow is tuned per view: generous over the skyline, restrained at street level where lit
  // surfaces fill the screen and would otherwise wash it out.
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 1.0, 0.85, 0.62);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Cameras.
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 130, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 90;
  controls.maxDistance = 2600;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.35;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  let walking = false;
  const walk = { yaw: 0, pitch: 0.28, x: 0, z: 0 };
  const keys = new Set<string>();
  const saved = { pos: new THREE.Vector3(), target: new THREE.Vector3() };

  /** True where a person cannot stand: inside a block's lots, or inside the spire. */
  function blocked(x: number, z: number): boolean {
    if (Math.abs(x) > EXTENT / 2 + 60 || Math.abs(z) > EXTENT / 2 + 60) return true;
    const fx = (((x - ORIGIN) % PITCH) + PITCH) % PITCH - PITCH / 2, fz = (((z - ORIGIN) % PITCH) + PITCH) % PITCH - PITCH / 2;
    const bx = Math.floor((x - ORIGIN) / PITCH), bz = Math.floor((z - ORIGIN) / PITCH);
    if (bx === MID && bz === MID) return Math.abs(x) < 26 && Math.abs(z) < 26;
    if (bx < 0 || bz < 0 || bx >= BLOCKS || bz >= BLOCKS) return false;
    return Math.abs(fx) < BLOCK / 2 - 3.2 && Math.abs(fz) < BLOCK / 2 - 3.2;
  }

  let drag: { id: number; x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') stage.touch = true;
    if (!walking) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!walking || !drag || drag.id !== e.pointerId) return;
    walk.yaw -= (e.clientX - drag.x) * 0.0042;
    walk.pitch = Math.max(-0.6, Math.min(1.35, walk.pitch - (e.clientY - drag.y) * 0.0042));
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const endDrag = (e: PointerEvent) => { if (drag?.id === e.pointerId) drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', e => { keys.add(e.key.toLowerCase()); });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  function stepWalk(dt: number): void {
    let f = 0, s = 0;
    if (keys.has('w') || keys.has('arrowup') || stage.walkHold) f += 1;
    if (keys.has('s') || keys.has('arrowdown')) f -= 1;
    if (keys.has('d') || keys.has('arrowright')) s += 1;
    if (keys.has('a') || keys.has('arrowleft')) s -= 1;
    const speed = (keys.has('shift') ? 22 : 8) * dt;
    const sin = Math.sin(walk.yaw), cos = Math.cos(walk.yaw);
    const dx = (-sin * f + cos * s) * speed, dz = (-cos * f - sin * s) * speed;
    if (!blocked(walk.x + dx, walk.z)) walk.x += dx;
    if (!blocked(walk.x, walk.z + dz)) walk.z += dz;
    const bob = f || s ? Math.sin(performance.now() * 0.011) * 0.05 : 0;
    camera.position.set(walk.x, 1.75 + bob, walk.z);
    camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
  }

  function resize(): void {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const stage: Stage = {
    renderer, scene, camera, controls, shared, canvas, rain,
    get walking() { return walking; },
    touch: matchMedia('(pointer: coarse)').matches,
    glow: true,
    walkHold: false,
    onView: () => {},
    setView(street) {
      if (street === walking) return;
      walking = street;
      controls.enabled = !street;
      if (street) {
        saved.pos.copy(camera.position); saved.target.copy(controls.target);
        controls.autoRotate = false;
        // An avenue beside the plaza, looking up at the spire.
        walk.x = ORIGIN + 4 * PITCH; walk.z = ORIGIN + 7 * PITCH - 6; walk.yaw = -0.2; walk.pitch = 0.45;
        camera.fov = 72;
        bloom.strength = 0.38; bloom.threshold = 0.8; renderer.toneMappingExposure = 0.95;
      } else {
        camera.position.copy(saved.pos); controls.target.copy(saved.target);
        camera.fov = 50;
        bloom.strength = 1.0; bloom.threshold = 0.62; renderer.toneMappingExposure = 1.15;
      }
      camera.updateProjectionMatrix();
      stage.onView(street);
    },
    pick(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
    },
    frame(dt, t, rising, spire, spireTop, busy) {
      if (canvas.width !== Math.round(canvas.clientWidth * renderer.getPixelRatio()) || canvas.height !== Math.round(canvas.clientHeight * renderer.getPixelRatio())) resize();

      for (let i = 0; i < TRAFFIC; i++) {
        const l = lanes[i];
        const along = ((((l.off + l.speed * t) % trafficSpan) + trafficSpan) % trafficSpan) - trafficSpan / 2;
        trafficPos[i * 3] = l.axis === 0 ? along : l.line;
        trafficPos[i * 3 + 1] = l.y;
        trafficPos[i * 3 + 2] = l.axis === 0 ? l.line : along;
      }
      trafficGeo.attributes.position.needsUpdate = true;

      // Drones swarm whatever is going up; with nothing to build they circle the spire.
      for (let i = 0; i < DRONES; i++) {
        const target = rising.length ? rising[i % rising.length] : spire;
        const a = t * (0.6 + (i % 7) * 0.13) + i * 2.4;
        const r = target.radius * (1.1 + (i % 5) * 0.12);
        const y = rising.length ? target.height * target.p + 4 + Math.sin(a * 2.3 + i) * 6 : spireTop * 0.55 + Math.sin(a + i) * 120;
        tmp.set(target.x + Math.cos(a) * r, Math.max(2, y), target.z + Math.sin(a) * r);
        const k = Math.min(1, dt * 2.2);
        dronePos[i * 3] += (tmp.x - dronePos[i * 3]) * k;
        dronePos[i * 3 + 1] += (tmp.y - dronePos[i * 3 + 1]) * k;
        dronePos[i * 3 + 2] += (tmp.z - dronePos[i * 3 + 2]) * k;
      }
      droneGeo.attributes.position.needsUpdate = true;

      // The Architect rides the top of its spire.
      architect.visible = spire.p > 0.02;
      architect.position.y = (spire.group?.position.y ?? 0) + spireTop - 70;
      rings.forEach((ring, i) => {
        ring.position.y = -120 + i * 34 + Math.sin(t * 0.8 + i * 2) * 8;
        ring.rotation.z = t * (0.4 + i * 0.25) * (i % 2 ? -1 : 1);
        ring.rotation.x = Math.PI / 2 + Math.sin(t * 0.5 + i) * 0.25;
      });
      beams.forEach((b, i) => {
        b.visible = spire.p > 0.5;
        b.rotation.set(0.5 + Math.sin(t * 0.21 + i * 1.7) * 0.32, 0, Math.sin(t * 0.17 + i * 2.3) * 0.5);
      });
      core.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.24 + Math.sin(t * 2.1) * 0.05;
      const pulseT = (t % 5) / 5;
      pulse.visible = busy;
      pulse.scale.setScalar(20 + pulseT * 700);
      (pulse.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - pulseT);
      // A couple of signs with bad wiring.
      shared.signs[3].mat.opacity = Math.sin(t * 31) > 0.82 || Math.sin(t * 7.3) > 0.93 ? 0.25 : 1;
      shared.signs[8].mat.opacity = Math.sin(t * 23 + 1) > 0.9 ? 0.4 : 1;

      if (walking) stepWalk(dt); else controls.update();

      if (rain.visible) {
        const c = camera.position;
        for (let i = 0; i < RAIN; i++) {
          const sx = rainSeed[i * 3], sy = rainSeed[i * 3 + 1], sz = rainSeed[i * 3 + 2];
          const x = c.x + ((((sx * RBOX.x - c.x) % RBOX.x) + RBOX.x) % RBOX.x) - RBOX.x / 2;
          const z = c.z + ((((sz * RBOX.z - c.z) % RBOX.z) + RBOX.z) % RBOX.z) - RBOX.z / 2;
          const fall = sy * RBOX.y - t * (95 + sx * 40) - c.y;
          const y = c.y + (((fall % RBOX.y) + RBOX.y) % RBOX.y) - RBOX.y / 2;
          rainPos.set([x, y, z, x + 0.25, y - 3.2, z + 0.1], i * 6);
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
      sky.position.copy(camera.position);

      if (stage.glow) composer.render(); else renderer.render(scene, camera);
    },
  };
  resize();
  return stage;
}
