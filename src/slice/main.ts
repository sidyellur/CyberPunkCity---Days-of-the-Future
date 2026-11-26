// Visual slice: a district raised by the Architect. No gameplay; this is a look-and-feel test.
import './slice.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  BLOCKS, BLOCK, PITCH, ORIGIN, EXTENT, GROUND_TILES, INTENTS, IntentKey, District, Structure,
  createShared, generateDistrict, lampSpots, mulberry,
} from './district07';
import { STREET_CORNER } from './street';
import { createTransit } from './transit';
import { createRetrofit } from './retrofit';
import { createStreetLife } from './streetLife';
import { createMarketDisplay } from './marketDisplay';
import { createCanal, CANAL_COLUMN } from './canal';
import { createStormSky } from './stormLight';
import { createHorizon } from './horizon';
import { createSkyTether } from './skyTether';
import { createSkyLinks } from './skyLinks';
import { createRooftops } from './rooftops';
import { createExchangeLights } from './exchangeFrontage';

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('scene') as HTMLCanvasElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const STREET_FOG = 0x24103f;
const OVERVIEW_FOG = 0x626f77;
const OVERVIEW_FOG_DENSITY = 0.00132;

function boot(): void {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    const el = document.createElement('div');
    el.className = 'fallback';
    el.textContent = 'This view needs WebGL, which this browser or device has switched off.';
    document.body.appendChild(el);
    return;
  }
  const small = Math.min(innerWidth, innerHeight) < 600;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = !small;

  const scene = new THREE.Scene();
  const haze = new THREE.FogExp2(OVERVIEW_FOG, OVERVIEW_FOG_DENSITY);
  scene.fog = haze;
  const skylineFov = small ? 67 : 58;
  const camera = new THREE.PerspectiveCamera(skylineFov, 1, 0.5, 9000);
  const overlook = new THREE.Vector3(224, 97, 452);
  const focus = new THREE.Vector3(117, 78, 234);
  const widePosition = new THREE.Vector3(-146, 488, 723);
  const wideFocus = new THREE.Vector3(14, 224, 61);

  // ----- Sky: a glow on the horizon fading to black overhead -----
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(7000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        low: { value: new THREE.Color(0x454053) },
        mid: { value: haze.color },
        high: { value: new THREE.Color(0x162642) },
        street: { value: 0 },
      },
      vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec3 v;
        uniform vec3 low, mid, high;
        uniform float street;
        void main() {
          vec3 direction = normalize(v);
          float elevation = max(0.0, direction.y);
          vec3 color = mix(low, mid, smoothstep(0.0, mix(0.24, 0.11, street), elevation));
          vec3 zenith = mix(high, vec3(0.0006, 0.0009, 0.0024), street);
          color = mix(color, zenith, smoothstep(mix(0.12, 0.08, street), mix(0.65, 0.5, street), elevation));
          float folds = sin(direction.z * 17.0 - direction.x * 8.0 + elevation * 53.0)
            * sin(direction.x * 9.0 + elevation * 78.0) * 0.5 + 0.5;
          float cloud = smoothstep(0.47, 0.9, folds)
            * smoothstep(0.01, 0.16, elevation) * (1.0 - smoothstep(0.17, 0.62, elevation));
          color += cloud * vec3(0.007, 0.009, 0.013) * (1.0 - street);
          float twilight = pow(max(0.0, dot(direction, normalize(vec3(-0.73, 0.05, -0.68)))), 4.0)
            * exp(-4.8 * elevation) * (1.0 - street);
          color += vec3(0.085, 0.037, 0.018) * twilight;
          color = mix(mid, color, mix(smoothstep(-0.08, 0.045, direction.y), 1.0, street));
          gl_FragColor = vec4(color, 1.0);
        }`,
    }),
  );
  scene.add(sky);
  const stormSky = createStormSky();
  scene.environment = stormSky;
  scene.backgroundIntensity = 0.88;

  // ----- Light: mostly emissive surfaces, with two coloured washes for shape -----
  const ambient = new THREE.HemisphereLight(0x4b3a8c, 0x06070c, 0.9);
  scene.add(ambient);
  const wash1 = new THREE.DirectionalLight(0xff4d9d, 0.9); wash1.position.set(-1, 0.6, 0.4);
  const wash2 = new THREE.DirectionalLight(0x35c8ff, 0.7); wash2.position.set(0.8, 0.5, -1);
  scene.add(wash1, wash2, wash1.target);
  wash1.target.position.set(88, 56, 204);
  wash1.castShadow = !small;
  wash1.shadow.mapSize.set(2048, 2048);
  Object.assign(wash1.shadow.camera, { left: -218, right: 218, top: 225, bottom: -190, near: 15, far: 1000 });
  wash1.shadow.camera.updateProjectionMatrix();
  wash1.shadow.normalBias = 0.19;
  wash1.shadow.bias = -0.00018;
  wash1.shadow.autoUpdate = false;

  const shared = createShared();
  const rng = mulberry(4242);
  const transit = createTransit();
  const retrofit = createRetrofit();
  const streetLife = createStreetLife();
  const marketDisplay = createMarketDisplay();
  const canal = createCanal();
  const tether = createSkyTether();
  const gallery = createSkyLinks();
  scene.add(tether.root, gallery);
  scene.add(transit.root, streetLife.root, canal.root, createHorizon(shared.windows[1], EXTENT));
  const cornerFeatures = [retrofit, streetLife, marketDisplay];
  const streetObstacles = [...transit.colliders, ...streetLife.colliders];
  for (const feature of cornerFeatures) feature.update(0);
  transit.update(0);
  canal.update(0);
  let cornerTime = 0;
  let streetEntered = false;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_TILES * PITCH, GROUND_TILES * PITCH).rotateX(-Math.PI / 2), shared.ground);
  ground.receiveShadow = true;
  const exchangeLights = createExchangeLights(!small);
  scene.add(ground, exchangeLights);

  // ----- Street lamps -----
  {
    const spots = lampSpots();
    const n = (BLOCKS * (BLOCKS - 1) - 1) * spots.length;
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 7, 0.25).translate(0, 3.5, 0), new THREE.MeshStandardMaterial({ color: 0x1a1d2a, roughness: 0.6 }), n);
    const heads = new Float32Array(n * 3);
    const m = new THREE.Matrix4();
    let i = 0;
    const mid = (BLOCKS - 1) / 2;
    for (let bz = 0; bz < BLOCKS; bz++) for (let bx = 0; bx < BLOCKS; bx++) {
      if (bx === CANAL_COLUMN || (bx === mid && bz === mid)) continue;
      const cx = ORIGIN + (bx + 0.5) * PITCH, cz = ORIGIN + (bz + 0.5) * PITCH;
      for (const [lx, lz] of spots) {
        posts.setMatrixAt(i, m.makeTranslation(cx + lx, 0, cz + lz));
        heads.set([cx + lx, 7.2, cz + lz], i * 3);
        i++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(heads, 3));
    const lights = new THREE.Points(geo, new THREE.PointsMaterial({
      map: shared.sprite, color: new THREE.Color(0xffb070).multiplyScalar(2), size: 2.4, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    scene.add(posts, lights);
  }

  // ----- Air and street traffic: points of light running the street lines -----
  const TRAFFIC = small ? 420 : 760;
  const traffic = { pos: new Float32Array(TRAFFIC * 3), lane: [] as { axis: 0 | 1; line: number; y: number; speed: number; off: number }[] };
  const trafficGeo = new THREE.BufferGeometry();
  const trafficSpan = EXTENT + 900;
  const trafficLights = new THREE.PointsMaterial({
    map: shared.sprite, vertexColors: true, size: 6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  {
    const col = new Float32Array(TRAFFIC * 3);
    const palette = [new THREE.Color(0xffffff), new THREE.Color(0xff4040), new THREE.Color(0xffb347), new THREE.Color(0x7de8ff)];
    for (let i = 0; i < TRAFFIC; i++) {
      const levels = [1.4, 48, 95, 150, 210];
      const dir = rng() < 0.5 ? 1 : -1;
      const level = Math.floor(rng() * levels.length);
      traffic.lane.push({
        axis: rng() < 0.5 ? 0 : 1, line: ORIGIN + Math.floor(rng() * (BLOCKS + 1)) * PITCH + dir * 3.2,
        y: levels[level] + (rng() - 0.5) * (level ? 8 : 0), speed: dir * (level ? 30 + rng() * 45 : 9 + rng() * 9), off: rng() * trafficSpan,
      });
      const c = palette[dir > 0 ? (rng() < 0.7 ? 0 : 2) : (rng() < 0.7 ? 1 : 3)].clone().multiplyScalar(1.8);
      col.set([c.r, c.g, c.b], i * 3);
    }
    trafficGeo.setAttribute('position', new THREE.BufferAttribute(traffic.pos, 3));
    trafficGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(trafficGeo, trafficLights);
    pts.frustumCulled = false;
    scene.add(pts);
  }

  // ----- Rain: streaks in a box that follows the camera -----
  const RAIN = small ? 900 : 1800, RBOX = new THREE.Vector3(160, 110, 160);
  const rainPos = new Float32Array(RAIN * 6), rainSeed = new Float32Array(RAIN * 3);
  for (let i = 0; i < RAIN * 3; i++) rainSeed[i] = rng();
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9db8ff, transparent: true, opacity: 0.22, depthWrite: false }));
  rain.frustumCulled = false;
  scene.add(rain);

  // ----- Construction drones -----
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

  // ----- The Architect: beam, core and rings on the spire -----
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
    ring.rotation.x = Math.PI / 2;
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

  // ----- Searchlights sweeping the haze -----
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
    cone.position.set(Math.cos(a) * (150 + (i % 3) * 90), 60 + (i % 4) * 30, Math.sin(a) * (150 + (i % 3) * 90));
    beams.push(cone);
    scene.add(cone);
  }

  // ----- Post-processing -----
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, samples: small ? 0 : Math.min(2, renderer.capabilities.maxSamples),
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.72, 0.7);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function setAtmosphere(street: boolean): void {
    sky.visible = street;
    scene.background = street ? null : stormSky;
    scene.environmentIntensity = street ? 0.23 : 0.95;
    exchangeLights.visible = !street;
    trafficLights.size = street ? 6 : 2.2;
    trafficLights.opacity = street ? 1 : 0.66;
    renderer.toneMappingExposure = street ? 1.15 : 1.23;
    ambient.color.setHex(street ? 0x4b3a8c : 0xb9d5dd);
    ambient.groundColor.setHex(street ? 0x06070c : 0x293239);
    ambient.intensity = street ? 0.9 : 0.66;
    wash1.color.setHex(street ? 0xff4d9d : 0xffcf9f);
    wash1.position.copy(wash1.target.position);
    if (street) wash1.position.add(new THREE.Vector3(-400, 240, 160));
    else wash1.position.add(new THREE.Vector3(-540, 275, 72));
    wash1.shadow.needsUpdate = true;
    wash1.intensity = street ? 0.9 : 2.95;
    wash2.color.setHex(street ? 0x35c8ff : 0x9ccce6);
    wash2.intensity = street ? 0.7 : 0.67;
    haze.color.setHex(street ? STREET_FOG : OVERVIEW_FOG);
    haze.density = street ? 0.0015 : OVERVIEW_FOG_DENSITY;
    sky.material.uniforms.low.value.setHex(street ? 0x7a2f6a : 0x68677b);
    sky.material.uniforms.street.value = Number(street);
    (rain.material as THREE.LineBasicMaterial).opacity = street ? 0.22 : 0.035;
  }
  setAtmosphere(false);

  // ----- District state -----
  let intent: IntentKey = 'balanced';
  let district: District;
  let galleryAnchors: Structure[];
  let rooftops: ReturnType<typeof createRooftops>;
  let clock = 0; // build clock, seconds
  let seed = 7;
  let finished = false;

  function schedule(d: District, prebuilt: number): void {
    d.structures.forEach((s, i) => {
      s.rise = 5 + (s.height / 60) * 1.4;
      s.start = i < prebuilt || (prebuilt > 0 && s.featured) ? -100 : 3.5 + (i - prebuilt) * 0.2;
    });
    d.spire.start = prebuilt > 0 ? -100 : 0.6;
  }

  function raise(newSeed: number, prebuiltShare: number): void {
    if (district) {
      retrofit.root.removeFromParent();
      marketDisplay.root.removeFromParent();
      scene.remove(district.root);
      district.dispose();
      rooftops.dispose();
    }
    seed = newSeed;
    district = generateDistrict(seed, intent, shared);
    galleryAnchors = district.structures.filter(s => s.galleryAnchor);
    rooftops = createRooftops();
    district.structures.forEach((building, index) => {
      if (building.featured === 'apartments') building.group?.add(retrofit.root);
      if (building.featured === 'market') building.group?.add(marketDisplay.root);
      if (building.group && building.roof) rooftops.attach(building.group, building.roof, seed + index * 31);
    });
    schedule(district, Math.floor(district.structures.length * prebuiltShare));
    if (!small) {
      for (const s of [...district.structures, district.spire]) {
        if (Math.abs(s.x - 88) > 300 || Math.abs(s.z - 204) > 300) continue;
        s.group?.traverse(o => {
          if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && !o.material.transparent) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
      }
      wash1.shadow.needsUpdate = true;
    }
    scene.add(district.root);
    clock = 0;
    finished = false;
    advance(0);
  }

  const m4 = new THREE.Matrix4();
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);

  function place(s: Structure, index: number, now: number): void {
    const plan = s.start - 1.6;
    if (now < plan) return;
    if (now < s.start) {
      if (s.holo) {
        s.holo.visible = true;
        const k = (now - plan) / 1.6;
        (s.holo.material as THREE.LineBasicMaterial).opacity = 0.75 * k * (0.75 + 0.25 * Math.sin(now * 40 + index));
      }
      return;
    }
    const p = Math.min(1, ease((now - s.start) / s.rise));
    s.p = p;
    if (s.group) {
      s.group.visible = true;
      s.group.position.y = -(s.height + 3) * (1 - p);
    }
    if (s.holo) {
      s.holo.visible = p < 1;
      (s.holo.material as THREE.LineBasicMaterial).opacity = 0.75 * (1 - p);
    }
    if (index >= 0) {
      const r = s.radius * 3.4 * p;
      district.decals.setMatrixAt(index, m4.makeScale(r, 1, r).setPosition(s.x, 0.12, s.z));
      district.decals.instanceMatrix.needsUpdate = true;
      for (let t = s.trees[0]; t < s.trees[1]; t++) {
        const base = district.treeBase[t];
        m4.copy(base).scale(new THREE.Vector3(p, p, p));
        m4.elements[13] = base.elements[13] * p;
        district.trees.setMatrixAt(t, m4);
        district.trees.instanceMatrix.needsUpdate = true;
      }
    }
    if (p >= 1) s.done = true;
  }

  const rising: Structure[] = [];
  function advance(dt: number): void {
    clock += dt;
    rising.length = 0;
    let built = 0;
    if (!district.spire.done) { place(district.spire, -1, clock); if (district.spire.p > 0 && !district.spire.done) rising.push(district.spire); }
    district.structures.forEach((s, i) => {
      if (!s.done) place(s, i, clock);
      if (s.done) built++;
      else if (s.p > 0) rising.push(s);
    });
    gallery.visible = galleryAnchors.every(s => s.done);
    const total = district.structures.length;
    const done = built === total && district.spire.done;
    if (!small && (done || Math.floor(clock * 4) !== Math.floor((clock - dt) * 4))) wash1.shadow.needsUpdate = true;
    ($('meter-fill') as HTMLElement).style.width = `${(built / total) * 100}%`;
    if (done && !finished) {
      finished = true;
      $('status').innerHTML = `<b>ARCHITECT</b> District complete. ${total} structures, tallest ${Math.round(district.spireTop)} m.`;
    } else if (!done) {
      $('status').innerHTML = `<b>ARCHITECT</b> ${built < 3 && !district.spire.done ? 'Surveying the ground' : 'Raising the district'}: ${built} / ${total}`;
    }
    // The Architect rides the top of its spire.
    architect.visible = district.spire.p > 0.02;
    architect.position.y = (district.spire.group?.position.y ?? 0) + district.spireTop - 70;
  }

  // ----- Cameras -----
  const controls = new OrbitControls(camera, canvas);
  camera.position.copy(overlook);
  controls.target.copy(focus);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 90;
  controls.maxDistance = 2600;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.update();

  let walking = false;
  const walk = { yaw: 0, pitch: 0.28, x: 0, z: 0, hold: false };
  const keys = new Set<string>();
  const saved = { pos: new THREE.Vector3(), target: new THREE.Vector3() };

  /** True where a person cannot stand: inside a block's lots, or inside the spire. */
  function blocked(x: number, z: number): boolean {
    if (streetObstacles.some(c => x > c.minX - 0.3 && x < c.maxX + 0.3 && z > c.minZ - 0.3 && z < c.maxZ + 0.3)) return true;
    if (Math.abs(x) > EXTENT / 2 + 60 || Math.abs(z) > EXTENT / 2 + 60) return true;
    const fx = (((x - ORIGIN) % PITCH) + PITCH) % PITCH - PITCH / 2, fz = (((z - ORIGIN) % PITCH) + PITCH) % PITCH - PITCH / 2;
    const bx = Math.floor((x - ORIGIN) / PITCH), bz = Math.floor((z - ORIGIN) / PITCH);
    const mid = (BLOCKS - 1) / 2;
    if (canal.blocksWalk(x, z)) return true;
    if (bx === CANAL_COLUMN) return false;
    if (bx === mid && bz === mid) return Math.abs(x) < 26 && Math.abs(z) < 26;
    if (bx < 0 || bz < 0 || bx >= BLOCKS || bz >= BLOCKS) return false;
    return Math.abs(fx) < BLOCK / 2 - 3.2 && Math.abs(fz) < BLOCK / 2 - 3.2;
  }

  function setView(street: boolean): void {
    if (street === walking) return;
    walking = street;
    $('view-sky').classList.toggle('on', !street);
    $('view-wide').classList.remove('on');
    $('view-street').classList.toggle('on', street);
    controls.enabled = !street;
    if (street) {
      saved.pos.copy(camera.position); saved.target.copy(controls.target);
      Object.assign(walk, STREET_CORNER.camera);
      streetEntered = true;
      setAtmosphere(true);
      bloom.strength = 0.38;
      bloom.threshold = 0.88;
      camera.fov = 72;
    } else {
      setAtmosphere(false);
      bloom.strength = 0.7;
      bloom.threshold = 0.7;
      camera.position.copy(saved.pos); controls.target.copy(saved.target);
      camera.fov = skylineFov;
    }
    camera.updateProjectionMatrix();
    if (street) stepWalk(0); else controls.update();
    ($('walk-hold') as HTMLElement).hidden = !(street && touch);
    hint();
  }

  let touch = matchMedia('(pointer: coarse)').matches;
  let hintTimer = 0;
  function hint(): void {
    $('hint').classList.remove('fade');
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => $('hint').classList.add('fade'), 7000);
    $('hint').textContent = walking
      ? (touch ? 'Drag to look around. Hold the button to walk.' : 'Drag to look. W A S D or arrow keys to walk, Shift to run.')
      : (touch ? 'Drag to orbit, pinch to zoom, two fingers to pan.' : 'Drag to orbit, scroll to zoom, right-drag to pan.');
  }

  let drag: { id: number; x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' && !touch) { touch = true; hint(); }
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
  const hold = $('walk-hold');
  hold.addEventListener('pointerdown', e => { walk.hold = true; hold.setPointerCapture(e.pointerId); });
  for (const ev of ['pointerup', 'pointercancel']) hold.addEventListener(ev, () => { walk.hold = false; });

  function stepWalk(dt: number): void {
    let f = 0, s = 0;
    if (keys.has('w') || keys.has('arrowup') || walk.hold) f += 1;
    if (keys.has('s') || keys.has('arrowdown')) f -= 1;
    if (keys.has('d') || keys.has('arrowright')) s += 1;
    if (keys.has('a') || keys.has('arrowleft')) s -= 1;
    const speed = (keys.has('shift') ? 22 : 8) * dt;
    const sin = Math.sin(walk.yaw), cos = Math.cos(walk.yaw);
    const dx = (-sin * f + cos * s) * speed, dz = (-cos * f - sin * s) * speed;
    if (!blocked(walk.x + dx, walk.z)) walk.x += dx;
    if (!blocked(walk.x, walk.z + dz)) walk.z += dz;
    const bob = f || s ? Math.sin(performance.now() * 0.011) * 0.05 : 0;
    camera.position.set(walk.x, 1.75 + bob + canal.walkHeight(walk.x, walk.z), walk.z);
    camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
  }

  // ----- Controls strip -----
  const intentsEl = $('intents');
  (Object.keys(INTENTS) as IntentKey[]).forEach(k => {
    const b = document.createElement('button');
    b.textContent = INTENTS[k].label;
    b.dataset.k = k;
    b.addEventListener('click', () => { intent = k; refreshIntent(); raise(seed + 1, 0); });
    intentsEl.appendChild(b);
  });
  function refreshIntent(): void {
    for (const b of Array.from(intentsEl.children) as HTMLElement[]) b.classList.toggle('on', b.dataset.k === intent);
    $('blurb').textContent = INTENTS[intent].blurb;
  }
  function frameSkyline(wide: boolean): void {
    setView(false);
    controls.enableDamping = false;
    controls.update();
    camera.position.copy(wide ? widePosition : overlook);
    controls.target.copy(wide ? wideFocus : focus);
    controls.update();
    controls.enableDamping = true;
    $('view-sky').classList.toggle('on', !wide);
    $('view-wide').classList.toggle('on', wide);
    hint();
  }

  $('view-sky').addEventListener('click', () => frameSkyline(false));
  $('view-wide').addEventListener('click', () => frameSkyline(true));
  $('view-street').addEventListener('click', () => setView(true));
  $('rebuild').addEventListener('click', () => raise(seed + 1, 0));
  $('skip').addEventListener('click', () => advance(1e4));
  $('rain').addEventListener('click', e => { rain.visible = !rain.visible; (e.currentTarget as HTMLElement).classList.toggle('on', rain.visible); });
  let glow = true;
  $('glow').addEventListener('click', e => { glow = !glow; (e.currentTarget as HTMLElement).classList.toggle('on', glow); });

  function resize(): void {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  // ----- Frame -----
  let last = performance.now();
  const tmp = new THREE.Vector3();
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    if (canvas.width !== Math.round(canvas.clientWidth * renderer.getPixelRatio())) resize();

    if (!finished) advance(dt);

    // Traffic.
    for (let i = 0; i < TRAFFIC; i++) {
      const l = traffic.lane[i];
      const along = ((((l.off + l.speed * t) % trafficSpan) + trafficSpan) % trafficSpan) - trafficSpan / 2;
      traffic.pos[i * 3] = l.axis === 0 ? along : l.line;
      traffic.pos[i * 3 + 1] = l.y;
      traffic.pos[i * 3 + 2] = l.axis === 0 ? l.line : along;
    }
    trafficGeo.attributes.position.needsUpdate = true;

    // Drones swarm whatever is going up; with nothing to build they circle the spire.
    const activeDrones = finished ? 14 : DRONES;
    droneGeo.setDrawRange(0, activeDrones);
    for (let i = 0; i < activeDrones; i++) {
      const target = rising.length ? rising[i % rising.length] : district.spire;
      const a = t * (0.6 + (i % 7) * 0.13) + i * 2.4;
      const r = target.radius * (1.1 + (i % 5) * 0.12);
      const y = rising.length ? target.height * target.p + 4 + Math.sin(a * 2.3 + i) * 6 : district.spireTop * 0.55 + Math.sin(a + i) * 120;
      tmp.set(target.x + Math.cos(a) * r, Math.max(2, y), target.z + Math.sin(a) * r);
      const k = Math.min(1, dt * 2.2);
      dronePos[i * 3] += (tmp.x - dronePos[i * 3]) * k;
      dronePos[i * 3 + 1] += (tmp.y - dronePos[i * 3 + 1]) * k;
      dronePos[i * 3 + 2] += (tmp.z - dronePos[i * 3 + 2]) * k;
    }
    droneGeo.attributes.position.needsUpdate = true;

    // Architect.
    rings.forEach((ring, i) => {
      ring.position.y = -120 + i * 34 + Math.sin(t * 0.8 + i * 2) * 8;
      ring.rotation.z = t * (0.4 + i * 0.25) * (i % 2 ? -1 : 1);
      ring.rotation.x = Math.PI / 2 + Math.sin(t * 0.5 + i) * 0.25;
    });
    beams.forEach((b, i) => {
      b.visible = walking && (finished || district.spire.p > 0.5);
      b.rotation.set(0.5 + Math.sin(t * 0.21 + i * 1.7) * 0.32, 0, Math.sin(t * 0.17 + i * 2.3) * 0.5);
    });
    const surveyActive = walking || !finished;
    beam.visible = surveyActive;
    core.scale.setScalar((surveyActive ? 1 : 0.42) * (1 + Math.sin(t * 3) * 0.08));
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.24 + Math.sin(t * 2.1) * 0.05;
    const pulseT = (t % 5) / 5;
    pulse.visible = !finished || (walking && pulseT < 0.5);
    pulse.scale.setScalar(20 + pulseT * 700);
    (pulse.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - pulseT);
    // A couple of signs with bad wiring.
    shared.signs[3].mat.opacity = Math.sin(t * 31) > 0.82 || Math.sin(t * 7.3) > 0.93 ? 0.25 : 1;
    shared.signs[8].mat.opacity = Math.sin(t * 23 + 1) > 0.9 ? 0.4 : 1;

    if (!reduced) {
      if (streetEntered) cornerTime += dt;
      const motionTime = Math.max(0, cornerTime - 1.6);
      transit.update(t, motionTime);
      canal.update(t);
      tether.update(t);
      if (streetEntered) for (const feature of cornerFeatures) feature.update(motionTime);
    }
    if (walking) stepWalk(dt); else controls.update();

    // Rain.
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

    if (glow) composer.render(); else { renderer.render(scene, camera); }
    requestAnimationFrame(frame);
  }

  refreshIntent();
  hint();
  resize();
  // Open on the complete city. New projects still rise when the Architect is briefed.
  raise(seed, 1);
  requestAnimationFrame(frame);

  (window as unknown as Record<string, unknown>).__slice = {
    advance: (s: number) => advance(s), setView, camera, controls, scene,
    get info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, structures: district.structures.length }; },
  };
}

boot();
