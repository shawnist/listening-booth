// The deck itself: plinth, platter with strobe dots, mats, spindle, controls and lamps.
// A generic design of our own; not modelled on any product.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  TAU, PLINTH, PLATE, PLATE_RECT, FOOT_H, Y_TABLE, R_PLATTER, R_PLATTER_TOP, Y_BEVEL, Y_PLATTER,
  R_MAT, Y_MAT, Y_REC, STROBE, CONTROLS,
} from './layout.js';
import { turnedTexture, knurlTexture, noiseTexture, woodTexture, plateTexture, feltTexture, blobTexture, startCapTexture, fadeTexture } from './textures.js';

export function lathe(pts, segments = 96) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 2e-5), y)), segments);
  g.computeTangents(); // so brushed-metal highlights run smoothly round the part instead of facet by facet
  return g;
}
// Lay a flat picture over a part, looking straight down.
function planarUV(geo, radius) {
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * radius) + 0.5, 0.5 - p.getZ(i) / (2 * radius));
  uv.needsUpdate = true;
  return geo;
}
function roundedRect(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + d - r); s.absarc(x + w - r, y + d - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + d); s.absarc(x + r, y + d - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}
// A slab with rounded corners lying flat, its top face at y = top.
function slab(w, d, r, h, bevel, top) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * bevel, d - 2 * bevel, Math.max(0.0005, r - bevel)), { depth: h - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, top - h + bevel, 0);
  return g;
}

export function makeMaterials() {
  const turned = turnedTexture(3), turnedFine = turnedTexture(11, 256, 90), knurl = knurlTexture(), noise = noiseTexture(256, 7, 90);
  const M = {};
  M.alu = new THREE.MeshPhysicalMaterial({ color: 0xb4b6ba, metalness: 1, roughness: 0.34, anisotropy: 0.75, bumpMap: turned, bumpScale: 0.25 });
  M.aluBright = new THREE.MeshPhysicalMaterial({ color: 0xc4c6ca, metalness: 1, roughness: 0.27, anisotropy: 0.55, bumpMap: turnedFine, bumpScale: 0.12 });
  M.tube = new THREE.MeshPhysicalMaterial({ color: 0xc2c4c8, metalness: 1, roughness: 0.3, anisotropy: 0.5 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 1, roughness: 0.07 });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1d, metalness: 0.85, roughness: 0.42 });
  M.darkTurned = new THREE.MeshStandardMaterial({ color: 0x242427, metalness: 0.9, roughness: 0.4, bumpMap: turnedFine, bumpScale: 0.1 });
  M.knurled = new THREE.MeshStandardMaterial({ color: 0xb9babd, metalness: 1, roughness: 0.38, bumpMap: knurl, bumpScale: 1.2 });
  M.knurledDark = new THREE.MeshStandardMaterial({ color: 0x2c2c30, metalness: 0.95, roughness: 0.42, bumpMap: knurl, bumpScale: 1.2 });
  M.plastic = new THREE.MeshStandardMaterial({ color: 0x101012, metalness: 0, roughness: 0.48 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, metalness: 0, roughness: 0.82, bumpMap: noise, bumpScale: 0.2 });
  M.brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.3 });
  M.noise = noise; M.knurl = knurl;
  return M;
}

export function createHardware(M, maxAniso) {
  const root = new THREE.Group();
  const hits = []; // invisible shapes the pointer tests against, each tagged with a control name
  const shadow = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = shadow(new THREE.Mesh(geo, mat)); m.position.set(x, y, z); parent.add(m); return m; };
  const hit = (name, geo, x, y, z) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false })); m.position.set(x, y, z); m.userData.control = name; root.add(m); hits.push(m); return m; };

  // ---- the table: a dark top that fades out into the page around the deck ------------------
  const cxp = (PLINTH.x0 + PLINTH.x1) / 2, czp = (PLINTH.z0 + PLINTH.z1) / 2, W = PLINTH.x1 - PLINTH.x0, D = PLINTH.z1 - PLINTH.z0;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshStandardMaterial({ color: 0x1b1917, roughness: 0.6, metalness: 0, alphaMap: fadeTexture(), transparent: true, bumpMap: noiseTexture(256, 51, 70, [80, 80]), bumpScale: 0.03 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cxp, Y_TABLE, czp); ground.receiveShadow = true; ground.renderOrder = -2; root.add(ground);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.9, D * 1.9), new THREE.MeshBasicMaterial({ map: blobTexture(W / D), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.set(cxp, Y_TABLE + 0.0005, czp + 0.004); blob.renderOrder = -1; root.add(blob);

  // ---- plinth ---------------------------------------------------------------------------
  const wood = woodTexture(); wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(2.1, 5.5); wood.offset.set(0.5, 0.13); wood.anisotropy = maxAniso;
  const woodMat = new THREE.MeshPhysicalMaterial({ map: wood, roughness: 0.56, metalness: 0, clearcoat: 0.22, clearcoatRoughness: 0.45 });
  add(root, slab(W, D, PLINTH.r + 0.004, PLINTH.h, 0.0022, -PLATE.t), woodMat, cxp, 0, czp);
  const R = PLATE_RECT, pw = R.x1 - R.x0, pd = R.z1 - R.z0;
  const plateTex = {}, plateNoise = noiseTexture(256, 17, 26, [10, 10]);
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.62, roughness: 0.86, roughnessMap: plateNoise, bumpMap: plateNoise, bumpScale: 0.05 });
  const setPlate = (deckKey) => {
    if (!plateTex[deckKey]) { const t = plateTexture(deckKey).texture; t.repeat.set(1 / pw, 1 / pd); t.offset.set(0.5, 0.5); t.anisotropy = maxAniso; plateTex[deckKey] = t; }
    plateMat.map = plateTex[deckKey]; plateMat.needsUpdate = true;
  };
  setPlate('dd');
  const plate = add(root, slab(pw, pd, PLINTH.r - 0.003, PLATE.t + 0.0012, 0.0006, 0), plateMat, (R.x0 + R.x1) / 2, 0, (R.z0 + R.z1) / 2);
  plate.castShadow = false;
  // feet
  const footGeo = lathe([[0, -FOOT_H], [0.021, -FOOT_H], [0.0225, -FOOT_H + 0.0015], [0.0225, -FOOT_H + 0.005], [0.026, -FOOT_H + 0.0062], [0.027, -FOOT_H + 0.0075], [0.027, -0.0012], [0.026, 0], [0, 0]], 48);
  for (const [fx, fz] of [[PLINTH.x0 + 0.05, PLINTH.z0 + 0.05], [PLINTH.x1 - 0.05, PLINTH.z0 + 0.05], [PLINTH.x0 + 0.05, PLINTH.z1 - 0.05], [PLINTH.x1 - 0.05, PLINTH.z1 - 0.05]]) add(root, footGeo, M.darkTurned, fx, -PLATE.t - PLINTH.h, fz);

  // ---- platter with strobe dots on its bevelled rim ---------------------------------------
  const platterPts = [[0.03, 0.0022], [R_PLATTER - 0.0008, 0.0022], [R_PLATTER, 0.003], [R_PLATTER, Y_BEVEL - 0.0003], [R_PLATTER - 0.0002, Y_BEVEL],
    [R_PLATTER_TOP + 0.0003, Y_PLATTER - 0.0004], [R_PLATTER_TOP - 0.0003, Y_PLATTER], [0.004, Y_PLATTER]];
  const bevelV = [4 / (platterPts.length - 1), 5 / (platterPts.length - 1)];
  const SU = {
    uBevel: { value: new THREE.Vector2(bevelV[0], bevelV[1]) },
    uTrue: { value: new THREE.Vector4(0, 0, 0, 0) }, // platter angle (turns), motion blur for each row, lamp level
    uStrobe: { value: new THREE.Vector4(0, 0, 0, 0) }, // what the lamp freezes: phase and blur for each row
    uLampU: { value: ((Math.PI / 2 - STROBE.angle) / TAU + 2) % 1 },
  };
  const platterMat = new THREE.MeshPhysicalMaterial({ color: 0xa9abb0, metalness: 1, roughness: 0.36, anisotropy: 0.7, bumpMap: turnedTexture(5, 512, 70), bumpScale: 0.2 });
  platterMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPUv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <clipping_planes_pars_fragment>', `#include <clipping_planes_pars_fragment>
        varying vec2 vPUv; uniform vec2 uBevel; uniform vec4 uTrue; uniform vec4 uStrobe; uniform float uLampU;
        float pulse1( float x, float d ) { return floor( x ) * d + min( fract( x ), d ); }
        float dotRow( float x, float d, float w ) { w = max( w, 1e-3 ); float a = fract( x + 0.5 * d - 0.5 * w ) + 1.0; return ( pulse1( a + w, d ) - pulse1( a, d ) ) / w; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float bv = ( vPUv.y - uBevel.x ) / ( uBevel.y - uBevel.x );
          if ( bv > 0.0 && bv < 1.0 ) {
            float u = vPUv.x, fw = fwidth( u ), fv = fwidth( bv ) + 0.02;
            float rowA = smoothstep( 0.13, 0.13 + fv, bv ) * ( 1.0 - smoothstep( 0.43 - fv, 0.43, bv ) );
            float rowB = smoothstep( 0.58, 0.58 + fv, bv ) * ( 1.0 - smoothstep( 0.88 - fv, 0.88, bv ) );
            float tA = dotRow( ${STROBE.dots33}.0 * ( u + uTrue.x ), 0.44, max( ${STROBE.dots33}.0 * fw, uTrue.y ) );
            float tB = dotRow( ${STROBE.dots45}.0 * ( u + uTrue.x ), 0.44, max( ${STROBE.dots45}.0 * fw, uTrue.z ) );
            float sA = dotRow( ${STROBE.dots33}.0 * u + uStrobe.x, 0.44, max( ${STROBE.dots33}.0 * fw, uStrobe.y ) );
            float sB = dotRow( ${STROBE.dots45}.0 * u + uStrobe.z, 0.44, max( ${STROBE.dots45}.0 * fw, uStrobe.w ) );
            float du = abs( fract( u - uLampU + 0.5 ) - 0.5 );
            float lamp = exp( - pow( du / 0.04, 2.0 ) ) * uTrue.w;
            float seen = mix( rowA * tA + rowB * tB, rowA * sA + rowB * sB, clamp( lamp * 1.6, 0.0, 1.0 ) );
            float band = max( rowA, rowB );
            diffuseColor.rgb = mix( diffuseColor.rgb, mix( vec3( 0.02 ), diffuseColor.rgb, seen ), band );
            metalnessFactor = mix( metalnessFactor, mix( 0.1, 1.0, seen ), band );
            roughnessFactor = mix( roughnessFactor, mix( 0.7, 0.28, seen ), band );
            totalEmissiveRadiance += vec3( 1.0, 0.2, 0.04 ) * lamp * band * ( 0.03 + 0.97 * ( rowA * sA + rowB * sB ) ) * 1.3;
          }
        }`);
  };
  platterMat.customProgramCacheKey = () => 'groove-deck-platter-2';
  const platter = add(root, lathe(platterPts, 320), platterMat);

  // ---- mats -----------------------------------------------------------------------------
  const spin = new THREE.Group(); root.add(spin); // turns with the record (the slipmat goes with it)
  const platSpin = new THREE.Group(); root.add(platSpin); // turns with the platter
  const feltGeo = planarUV(lathe([[R_MAT, Y_PLATTER], [R_MAT, Y_MAT - 0.0007], [R_MAT - 0.0007, Y_MAT], [0.0042, Y_MAT]], 128), R_MAT);
  const felt = add(spin, feltGeo, new THREE.MeshPhysicalMaterial({ map: feltTexture(), roughness: 1, metalness: 0, sheen: 0.5, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x2c2c31), bumpMap: noiseTexture(256, 31, 120, [36, 36]), bumpScale: 0.55 }));
  felt.material.map.anisotropy = maxAniso;
  const spinBlur = { value: 0 }; // how far the mat turns during one frame, so its print smears instead of stuttering
  felt.material.onBeforeCompile = (sh) => {
    sh.uniforms.uSpin = spinBlur;
    sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_pars_fragment>', '#include <clipping_planes_pars_fragment>\nuniform float uSpin;').replace('#include <map_fragment>', `
      vec4 sampledDiffuseColor = vec4( 0.0 );
      float sj = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) - 0.5;
      for ( int k = 0; k < 7; k ++ ) {
        float sa = ( float( k ) - 3.0 + sj ) * uSpin / 7.0, sc = cos( sa ), ss = sin( sa ); vec2 q = vMapUv - 0.5;
        sampledDiffuseColor += texture2D( map, vec2( sc * q.x - ss * q.y, ss * q.x + sc * q.y ) + 0.5 );
      }
      diffuseColor *= sampledDiffuseColor / 7.0;`);
  };
  felt.material.customProgramCacheKey = () => 'groove-deck-felt-2';
  const ribs = [[R_MAT, Y_PLATTER], [R_MAT, Y_MAT - 0.0006], [R_MAT - 0.0006, Y_MAT]];
  for (let r = R_MAT - 0.006; r > 0.058; r -= 0.0068) ribs.push([r, Y_MAT], [r - 0.0008, Y_MAT - 0.0009], [r - 0.0020, Y_MAT - 0.0009], [r - 0.0028, Y_MAT]);
  ribs.push([0.0535, Y_MAT], [0.0525, Y_MAT - 0.0011], [0.0045, Y_MAT - 0.0011]);
  const rubberMat = new THREE.Group(); platSpin.add(rubberMat);
  add(rubberMat, lathe(ribs, 128), M.rubber);
  // moulded marks on the rubber mat so its turning shows
  for (let i = 0; i < 3; i++) { const a = (i * TAU) / 3, b = add(rubberMat, new RoundedBoxGeometry(0.018, 0.0012, 0.0035, 2, 0.0005), M.rubber, Math.cos(a) * 0.045, Y_MAT - 0.0009, Math.sin(a) * 0.045); b.rotation.y = -a + Math.PI / 2; }

  // ---- spindle and the 45 adapter ---------------------------------------------------------
  const spindle = add(root, lathe([[0.0036, Y_PLATTER], [0.0036, Y_REC + 0.0105], [0.0033, Y_REC + 0.0122], [0.0022, Y_REC + 0.0134], [0, Y_REC + 0.0138]], 32), M.chrome);
  const adapter = add(platSpin, lathe([[0.0188, Y_MAT], [0.0188, Y_REC + 0.0034], [0.0180, Y_REC + 0.0046], [0.0120, Y_REC + 0.0054], [0.0060, Y_REC + 0.0050], [0.0040, Y_REC + 0.0040], [0.0038, Y_REC + 0.0030]], 64), M.aluBright);
  adapter.visible = false;

  // ---- controls -------------------------------------------------------------------------
  const C = CONTROLS;
  // start / stop
  add(root, lathe([[C.start.r + 0.0035, 0], [C.start.r + 0.0035, 0.0022], [C.start.r + 0.0028, 0.003], [C.start.r + 0.0008, 0.003], [C.start.r + 0.0006, 0.0008]], 64), M.dark, C.start.x, 0, C.start.z);
  const startBtn = new THREE.Group(); startBtn.position.set(C.start.x, 0, C.start.z); root.add(startBtn);
  add(startBtn, lathe([[C.start.r, 0.0005], [C.start.r, 0.0052], [C.start.r - 0.0008, 0.006], [0, 0.006]], 64), M.aluBright);
  const cap = add(startBtn, new THREE.CircleGeometry(C.start.r - 0.0016, 64), new THREE.MeshStandardMaterial({ map: startCapTexture(), metalness: 0.9, roughness: 0.36 }), 0, 0.00605, 0);
  cap.rotation.x = -Math.PI / 2; cap.castShadow = false;
  const startLed = new THREE.MeshStandardMaterial({ color: 0x1a0d04, emissive: 0xff8a1f, emissiveIntensity: 0, roughness: 0.4 });
  const ledRing = add(root, new THREE.RingGeometry(C.start.r + 0.0001, C.start.r + 0.0010, 64), startLed, C.start.x, 0.00302, C.start.z);
  ledRing.rotation.x = -Math.PI / 2; ledRing.castShadow = false;
  hit('start', new THREE.CylinderGeometry(C.start.r + 0.004, C.start.r + 0.004, 0.009, 24), C.start.x, 0.0045, C.start.z);
  // speed buttons, each with its lamp
  const speedBtn = (c, name) => {
    const g = new THREE.Group(); g.position.set(c.x, 0, c.z); root.add(g);
    add(g, new RoundedBoxGeometry(c.w, 0.0056, c.d, 3, 0.0016), M.plastic, 0, 0.0018, 0);
    const led = new THREE.MeshStandardMaterial({ color: 0x1c0605, emissive: 0xff2b1a, emissiveIntensity: 0, roughness: 0.35 });
    const l = add(g, new THREE.CylinderGeometry(0.0013, 0.0013, 0.0006, 16), led, c.w / 2 - 0.0036, 0.0047, 0); l.castShadow = false;
    hit(name, new THREE.BoxGeometry(c.w + 0.006, 0.008, c.d + 0.006), c.x, 0.004, c.z);
    return { group: g, led };
  };
  const b33 = speedBtn(C.s33, 's33'), b45 = speedBtn(C.s45, 's45');
  // pitch fader
  const P = C.pitch;
  add(root, new RoundedBoxGeometry(0.015, 0.0016, P.travel * 2 + 0.02, 2, 0.0007), M.dark, P.x, 0.0004, P.z).castShadow = false;
  add(root, new THREE.BoxGeometry(0.0034, 0.0006, P.travel * 2 + 0.008), new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 0.9 }), P.x, 0.00105, P.z).castShadow = false;
  const fader = new THREE.Group(); fader.position.set(P.x, 0, P.z); root.add(fader);
  add(fader, new RoundedBoxGeometry(0.025, 0.0092, 0.0128, 4, 0.0022), M.plastic, 0, 0.0058, 0);
  add(fader, new THREE.BoxGeometry(0.0205, 0.0004, 0.0011), new THREE.MeshStandardMaterial({ color: 0xe8e6de, roughness: 0.5 }), 0, 0.0105, 0).castShadow = false;
  const zeroLed = new THREE.MeshStandardMaterial({ color: 0x051006, emissive: 0x3dff6a, emissiveIntensity: 0, roughness: 0.35 });
  add(root, new THREE.CylinderGeometry(0.0013, 0.0013, 0.0006, 16), zeroLed, P.x + 0.0125, 0.0003, P.z).castShadow = false;
  hit('pitch', new THREE.BoxGeometry(0.034, 0.014, P.travel * 2 + 0.03), P.x, 0.006, P.z);
  // cue lever
  add(root, new RoundedBoxGeometry(0.017, 0.0044, 0.03, 3, 0.0016), M.dark, C.cue.x, 0.0014, C.cue.z);
  const cueLever = new THREE.Group(); cueLever.position.set(C.cue.x, 0.0036, C.cue.z - 0.008); root.add(cueLever);
  const shaft = add(cueLever, new THREE.CylinderGeometry(0.0019, 0.0019, 0.027, 16), M.chrome, 0, 0, 0.0135); shaft.rotation.x = Math.PI / 2;
  const knob = add(cueLever, new THREE.CapsuleGeometry(0.0036, 0.0075, 6, 16), M.plastic, 0, 0, 0.0305); knob.rotation.x = Math.PI / 2;
  add(cueLever, new THREE.SphereGeometry(0.0034, 16, 12), M.dark);
  hit('cue', new THREE.BoxGeometry(0.026, 0.03, 0.05), C.cue.x, 0.012, C.cue.z + 0.006);

  // strobe lamp: a small turret whose window faces the platter rim
  const sl = new THREE.Group(); sl.position.set(C.strobe.x, 0, C.strobe.z); sl.rotation.y = -STROBE.angle; root.add(sl); // local -x points at the spindle
  add(sl, lathe([[C.strobe.r + 0.0012, 0], [C.strobe.r + 0.0012, 0.0015], [C.strobe.r, 0.0022], [C.strobe.r, 0.0128], [C.strobe.r - 0.0012, 0.0142], [0, 0.0146]], 40), M.darkTurned);
  const strobeLens = new THREE.MeshStandardMaterial({ color: 0x220804, emissive: 0xff3a14, emissiveIntensity: 0, roughness: 0.3 });
  const lens = add(sl, new THREE.BoxGeometry(0.0012, 0.0062, 0.0085), strobeLens, -C.strobe.r + 0.0002, 0.0088, 0); lens.castShadow = false;
  const strobeLight = new THREE.PointLight(0xff4418, 0, 0.16, 2);
  strobeLight.position.set(C.strobe.x - Math.cos(STROBE.angle) * 0.011, 0.012, C.strobe.z - Math.sin(STROBE.angle) * 0.011); root.add(strobeLight);

  // target light: a short post that throws a pool of light where the stylus lands
  const tl = new THREE.Group(); tl.position.set(C.target.x, 0, C.target.z); root.add(tl);
  add(tl, lathe([[C.target.r + 0.001, 0], [C.target.r + 0.001, 0.0014], [C.target.r, 0.002], [C.target.r, 0.031], [C.target.r - 0.001, 0.0322], [0, 0.0325]], 32), M.darkTurned);
  const targetLens = new THREE.MeshStandardMaterial({ color: 0x1a1710, emissive: 0xfff0cf, emissiveIntensity: 0, roughness: 0.3 });
  const tlens = add(tl, new THREE.CylinderGeometry(0.0034, 0.0034, 0.0008, 20), targetLens, 0, 0.0275, 0); tlens.castShadow = false;
  const targetLight = new THREE.SpotLight(0xfff0d4, 0, 0.5, 0.36, 0.85, 2);
  targetLight.position.set(C.target.x, 0.0285, C.target.z); root.add(targetLight); root.add(targetLight.target);
  const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
  const aimLens = (x, z) => { // turn the lens to face where it is aimed
    const dx = x - C.target.x, dz = z - C.target.z, d = Math.hypot(dx, dz) || 1;
    _dir.set(dx / d, -0.25, dz / d).normalize();
    tlens.position.set((dx / d) * (C.target.r - 0.0003), 0.0272, (dz / d) * (C.target.r - 0.0003));
    tlens.quaternion.setFromUnitVectors(_up, _dir);
    targetLight.position.set(C.target.x + (dx / d) * (C.target.r + 0.0005), 0.0276, C.target.z + (dz / d) * (C.target.r + 0.0005));
    targetLight.target.position.set(x, Y_REC, z);
  };

  // ---- the lathe's cutter head, lowered in for the cutting pass ---------------------------
  const cutter = new THREE.Group(); cutter.visible = false; root.add(cutter);
  {
    add(cutter, new RoundedBoxGeometry(0.03, 0.018, 0.024, 3, 0.003), M.dark, 0, 0.026, 0);
    for (const s of [-1, 1]) { // the two drive coils, set in a V like the two groove walls
      const coil = add(cutter, new THREE.CylinderGeometry(0.0075, 0.0075, 0.017, 24), M.brass, 0, 0.028, s * 0.0125); coil.rotation.x = s * 0.78;
      const capc = add(cutter, new THREE.CylinderGeometry(0.0062, 0.0062, 0.003, 24), M.aluBright, 0, 0.028 + 0.0071, s * 0.0195); capc.rotation.x = s * 0.78;
    }
    add(cutter, new THREE.CylinderGeometry(0.004, 0.004, 0.6, 16), M.chrome, 0, 0.335, 0); // the carriage rod, up out of view
    add(cutter, new THREE.CylinderGeometry(0.0022, 0.0034, 0.012, 16), M.aluBright, 0, 0.011, 0);
    // the cutting stylus: a sapphire in a steel shank. It is heated, but not so it glows: a real cut
    // shows no light, only the satin groove behind it and the thread it lifts (owner, 2026-11-19)
    const stylus = new THREE.MeshStandardMaterial({ color: 0xc9ced4, metalness: 0.7, roughness: 0.22 });
    const tip = add(cutter, new THREE.ConeGeometry(0.0016, 0.0056, 12), stylus, 0, 0.0028, 0); tip.rotation.x = Math.PI; tip.castShadow = false;
    const vac = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.004, 0.004, 0.003), new THREE.Vector3(0.012, 0.01, 0.008), new THREE.Vector3(0.014, 0.03, 0.012), new THREE.Vector3(0.01, 0.07, 0.012)]), 24, 0.0019, 10), M.rubber);
    shadow(vac); cutter.add(vac);
  }
  // the swarf: the fine thread of lacquer the stylus lifts out of the groove, curling up into the
  // suction tube's mouth. Shown only while the stylus is cutting.
  const swarf = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.0002, 0), new THREE.Vector3(0.0012, 0.0006, 0.0018), new THREE.Vector3(0.0006, 0.0014, 0.0032), new THREE.Vector3(0.0022, 0.0022, 0.0026), new THREE.Vector3(0.0032, 0.0034, 0.0034), new THREE.Vector3(0.004, 0.004, 0.003)]), 40, 0.00028, 6),
    new THREE.MeshStandardMaterial({ color: 0x0c0b0b, roughness: 0.18, metalness: 0 }));
  swarf.castShadow = false; swarf.visible = false; cutter.add(swarf);

  return {
    root, hits, platter, platterUniforms: SU, spinBlur, spin, platSpin, felt, rubberMat, spindle, adapter,
    startBtn, startLed, b33, b45, fader, zeroLed, cueLever, strobeLens, strobeLight, targetLens, targetLight, aimLens,
    cutter, swarf, setPlate, ground,
  };
}
