// The record: a disc whose surface is computed, pixel by pixel, from the groove map the
// lathe produced. Nothing here is a picture of a record.
//
// How vinyl catches light: a groove is a V-shaped trench running round the disc. Seen from
// any distance, thousands of them act like a brushed surface whose "grain" runs in circles.
// Light is thrown into a fan across the grooves, so a lamp shows up as bright streaks that
// radiate from the centre, and those streaks stay put while the record turns under them.
// Louder passages wiggle the groove walls, which spreads the streak sideways.
import * as THREE from 'three';
import { REC_T } from './layout.js';
import { makeCanvas, canvasTexture, drawLabel, wearTexture } from './textures.js';

const GROOVE_W = 56e-6; // top width of a silent groove (matches the cutter)
const DATA_W = 4096;

// One row of numbers across the playing surface, outer edge to run-out. For every radius:
//   r: which turn of the spiral is here (a fraction: 12.25 is a quarter of the way round turn 12)
//   g: spacing between neighbouring turns (metres)   b: loudness of that turn (0..1)
//   a: how wide the groove is, including its swing (metres; 0 where nothing is cut)
function grooveData(side) {
  const f = side.fmt, radii = side.radii, turns = side.turns;
  const rMin = f.lock - 0.002, rMax = f.disc;
  const data = new Float32Array(DATA_W * 4);
  const loud = new Float32Array(turns + 1);
  for (let k = 0; k < turns; k++) loud[k] = Math.pow(Math.min(1, side.turnRms[k] / 0.045), 0.6);
  const leadPitch = 0.0012, bead = f.disc - 0.0036;
  let k = 0;
  for (let i = DATA_W - 1; i >= 0; i--) {
    const r = rMin + ((i + 0.5) / DATA_W) * (rMax - rMin);
    let u, pitch, v = 0, w = 0;
    if (r >= radii[0]) { // lead-in: a quick spiral from the rim to the first turn
      u = -(r - radii[0]) / leadPitch; pitch = leadPitch; w = r < bead ? GROOVE_W : 0;
    } else if (r > radii[turns - 1]) {
      while (k < turns - 2 && radii[k + 1] >= r) k++;
      const p = Math.max(1e-6, radii[k] - radii[k + 1]), t = (radii[k] - r) / p;
      u = k + t; pitch = p;
      const a = loud[k], b = loud[Math.min(turns - 1, k + 1)], c = loud[Math.max(0, k - 1)];
      v = (a * 2 + b + c) / 4 + (b - a) * 0.25 * t;
      w = GROOVE_W + 70e-6 * v; // a loud groove swings wider
    } else { u = turns - 1; pitch = 1; }
    data[4 * i] = u; data[4 * i + 1] = pitch; data[4 * i + 2] = v; data[4 * i + 3] = w;
  }
  const tex = new THREE.DataTexture(data, DATA_W, 1, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; // interpolated by hand in the shader
  tex.needsUpdate = true;
  return { tex, rMin, rMax };
}

// Cross-section of the disc, spun into a solid: thin, with a raised bead at the rim and a
// slightly raised label area, as pressed records have.
function discGeometry(f) {
  const t = REC_T, R = f.disc, hole = Math.max(0.0036, f.hole), lab = f.label;
  const P = [];
  const add = (r, y) => P.push(new THREE.Vector2(r, y));
  add(hole, -t + 0.0002); add(hole + 0.0002, -t);
  add(lab, -t); add(R - 0.004, -t); add(R - 0.0008, -t);
  // rounded rim
  for (let i = 1; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI; add(R - 0.0008 + Math.cos(a) * 0.0008, -t / 2 + 0.00015 + Math.sin(a) * (t / 2 + 0.00015)); }
  add(R - 0.0022, 0.0003); add(R - 0.0034, 0.00006); add(R - 0.0037, 0);
  // the playing surface, with rings of vertices so a slight warp can bend it
  const inner = lab + 0.0012;
  for (let i = 1; i <= 14; i++) add(R - 0.0037 - ((R - 0.0037 - inner) * i) / 14, 0);
  add(lab + 0.0004, 0.00012); add(lab, 0.00022);
  add(hole + 0.0004, 0.00022); add(hole, 0.00006);
  add(hole, -t + 0.0002);
  const g = new THREE.LatheGeometry(P, 192);
  return g;
}

export function createRecord({ maxAnisotropy = 8 } = {}) {
  const group = new THREE.Group(); // spins about the spindle
  const offset = new THREE.Group(); // the pressing's off-centre hole
  group.add(offset);
  group.visible = false;

  const labelCanvas = makeCanvas(1024, 1024);
  const labelTex = canvasTexture(labelCanvas, { aniso: maxAnisotropy });
  const blank = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType); blank.needsUpdate = true;
  const blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blackTex.needsUpdate = true;

  const U = {
    uGroove: { value: blank }, uGrooveW: { value: 1 }, uGrooveR: { value: new THREE.Vector2(0.05, 0.15) },
    uLabel: { value: labelTex }, uWearMap: { value: blackTex },
    uLabelR: { value: 0.05 }, uDiscR: { value: 0.15 }, uLockR: { value: 0.05 },
    uRevealR: { value: 0 },
    uWear: { value: 0.2 }, uDust: { value: 0.1 }, uPhaseOff: { value: 0 },
    // warp: three waves round the disc, height uWA (metres at the rim) * cos(uWN * angle - uWP)
    uWA: { value: new THREE.Vector3(0.00022, 0.00009, 0) }, uWN: { value: new THREE.Vector3(1, 2, 1) }, uWP: { value: new THREE.Vector3(0.6, 2.1, 0) },
    uStreak: { value: 12.0 }, uFan: { value: 3.2 }, uIrid: { value: 0.16 }, uSpin: { value: 0 },
  };

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec2 vRecXZ; varying vec3 vRadialV; varying float vTop;
        uniform vec3 uWA, uWN, uWP; uniform float uDiscR;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRecXZ = position.xz;
        vRadialV = normalMatrix * vec3( position.x, 0.0, position.z );
        vTop = step( 0.5, normal.y ) * step( -0.0005, position.y ) * step( length( position.xz ), uDiscR - 0.0011 );
        { float th = atan( position.z, position.x ); float r2 = dot( position.xz, position.xz ) / ( uDiscR * uDiscR );
          transformed.y += r2 * dot( uWA, cos( uWN * th - uWP ) ); }`);

    sh.fragmentShader = sh.fragmentShader
      .replace('#include <clipping_planes_pars_fragment>', `#include <clipping_planes_pars_fragment>
        varying vec2 vRecXZ; varying vec3 vRadialV; varying float vTop;
        uniform sampler2D uGroove; uniform float uGrooveW; uniform vec2 uGrooveR;
        uniform sampler2D uLabel; uniform sampler2D uWearMap;
        uniform float uLabelR, uDiscR, uLockR, uRevealR, uWear, uDust, uPhaseOff, uStreak, uFan, uIrid, uSpin;
        uniform vec3 uWA, uWN, uWP;
        vec3 gN; vec3 gR; vec3 gT; vec3 gDirect = vec3( 0.0 );
        float gCov = 0.0; float gLoud = 0.0; float gSigma = 0.05;

        vec4 grooveAt( float r ) {
          float t = clamp( ( r - uGrooveR.x ) / ( uGrooveR.y - uGrooveR.x ), 0.0, 1.0 ) * uGrooveW - 0.5;
          float i = floor( t ), f = t - i;
          int i0 = int( clamp( i, 0.0, uGrooveW - 1.0 ) ), i1 = int( clamp( i + 1.0, 0.0, uGrooveW - 1.0 ) );
          return mix( texelFetch( uGroove, ivec2( i0, 0 ), 0 ), texelFetch( uGroove, ivec2( i1, 0 ), 0 ), f );
        }
        // Twice-integrated train of pulses (one pulse of width d per unit): lets a pixel ask
        // "how much groove do I cover" exactly, whether it spans a tenth of a groove or forty.
        float pulse2( float x, float d ) {
          float n = floor( x ), f = x - n;
          float g = f < d ? 0.5 * f * f : 0.5 * d * d + d * ( f - d );
          return d * n * ( n - 1.0 ) * 0.5 + n * ( d - 0.5 * d * d ) + n * d * f + g;
        }
        float lineCov( float d, float w, float aa ) { return clamp( ( 0.5 * ( w + aa ) - abs( d ) ) / aa, 0.0, 1.0 ) * min( 1.0, w / aa ); }
        // How much of the groove's surface faces each direction across the groove:
        // the flat land and rounded shoulders in the middle, the two walls at 45 degrees.
        float fanW( float a ) {
          float s = a / 0.34, w1 = ( a - 0.785 ) / 0.2, w2 = ( a + 0.785 ) / 0.2;
          return 0.55 * exp( -0.5 * s * s ) + 0.45 * ( exp( -0.5 * w1 * w1 ) + exp( -0.5 * w2 * w2 ) ) + 0.05;
        }
        void RE_Direct_Vinyl( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
          RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
          if ( gCov > 0.0005 ) {
            vec3 H = normalize( directLight.direction + geometryViewDir );
            float ht = dot( H, gT ), hn = dot( H, gN ), hr = dot( H, gR );
            float phi = atan( hr, max( hn, 1e-4 ) );
            vec3 sg = gSigma * vec3( 1.12, 1.0, 0.9 ); // red spreads a little wider than blue
            vec3 Dt = exp( -0.5 * ht * ht / ( sg * sg ) ) / ( sg * 2.5066 );
            float nl = clamp( dot( gN, directLight.direction ), 0.0, 1.0 );
            float F = 0.045 + 0.955 * pow( 1.0 - clamp( dot( geometryViewDir, H ), 0.0, 1.0 ), 5.0 );
            vec3 irid = 1.0 + uIrid * cos( 6.2831853 * ( hr * 9.0 + vec3( 0.0, 0.33, 0.67 ) ) );
            gDirect += directLight.color * ( nl * F * fanW( phi ) * uStreak * gCov ) * Dt * irid;
          }
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_Vinyl
      `)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float r = length( vRecXZ );
          float th = atan( vRecXZ.y, vRecXZ.x );
          float aa = max( fwidth( r ), 1e-6 );
          vec3 R0 = vRadialV / max( length( vRadialV ), 1e-6 );
          vec3 T0 = cross( R0, normal );
          float lab = ( 1.0 - smoothstep( uLabelR - aa, uLabelR + aa, r ) ) * vTop;
          // slight warp, as every real pressing has: tilts the surface so reflections breathe as it turns
          float c1 = dot( uWA, cos( uWN * th - uWP ) );
          float dhdr = 2.0 * r / ( uDiscR * uDiscR ) * c1;
          float dhdt = r / ( uDiscR * uDiscR ) * -dot( uWA * uWN, sin( uWN * th - uWP ) );
          // the ring a pressing leaves in the label
          float pr = ( r - 0.71 * uLabelR ) / 0.00045;
          float ring = pr * exp( -pr * pr ) * 0.5 * lab;
          normal = normalize( normal - ( R0 * ( dhdr - ring ) + T0 * dhdt ) * vTop );
          gN = normal;
          vec3 rr = vRadialV - dot( vRadialV, gN ) * gN;
          gR = rr / max( length( rr ), 1e-6 );
          gT = cross( gR, gN );

          vec4 gd = grooveAt( r );
          float cut = smoothstep( uRevealR - aa, uRevealR + aa, r );
          float duty = clamp( gd.a / max( gd.g, 1e-6 ), 0.0, 0.94 );
          float w = clamp( ( aa / max( gd.g, 1e-6 ) + length( fwidth( vRecXZ ) ) * 0.159155 / max( r, 1e-3 ) ) * 1.5, 1e-3, 48.0 );
          float ph = gd.r + th * 0.159155 + uPhaseOff;
          // the music itself: the groove swings from side to side (only visible up close)
          float turn = floor( ph + 0.5 );
          ph += gd.b * 0.16 * ( 1.0 - smoothstep( 0.25, 0.9, w ) ) * ( sin( th * 331.0 + turn * 1.7 ) * 0.6 + sin( th * 127.0 + turn * 2.9 ) * 0.4 );
          float x = fract( ph + 0.5 * duty ) + ceil( w ) + 1.0;
          float tri = ( pulse2( x + w, duty ) - 2.0 * pulse2( x, duty ) + pulse2( x - w, duty ) ) / ( w * w );
          float cov = mix( clamp( tri, 0.0, 1.0 ), duty, smoothstep( 10.0, 20.0, w ) );
          cov = max( cov, lineCov( r - uLockR, 0.00007, aa ) ); // the locked groove is a closed circle
          cov *= cut * vTop * ( 1.0 - lab );

          vec2 wuv = vec2( vRecXZ.x, -vRecXZ.y ) / ( 2.0 * uDiscR ) + 0.5;
          vec3 wm = texture2D( uWearMap, wuv ).rgb;
          float scr = smoothstep( 1.0 - uWear, 1.0 - uWear + 0.3, wm.r ) * ( 1.0 - lab ) * vTop * step( 0.001, uWear );
          float etch = wm.b * ( 1.0 - lab ) * vTop;
          float dust = smoothstep( 1.0 - uDust, 1.0 - uDust + 0.25, wm.g ) * vTop * step( 0.001, uDust );

          vec3 vinyl = mix( vec3( 0.008, 0.008, 0.010 ), vec3( 0.020, 0.020, 0.023 ) + 0.05 * gd.b, cov );
          // Uncut, the blank is the same smooth vinyl as the land between grooves (cov is 0 there), so
          // it looks as the bare run-out near the label of a short side does: the cut shows only as grooves.
          vinyl += vec3( 0.16 ) * scr + vec3( 0.10 ) * etch;
          vec3 paper = vec3( 0.0 ); // smeared along its path while the record turns, as the eye sees it
          float sj = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) - 0.5;
          for ( int k = 0; k < 7; k ++ ) {
            float sa = ( float( k ) - 3.0 + sj ) * uSpin / 7.0, sc = cos( sa ), ss = sin( sa );
            vec2 q = vec2( sc * vRecXZ.x - ss * vRecXZ.y, ss * vRecXZ.x + sc * vRecXZ.y );
            paper += texture2D( uLabel, vec2( q.x, -q.y ) / ( 2.0 * uLabelR ) + 0.5 ).rgb;
          }
          paper /= 7.0;
          diffuseColor.rgb = mix( vinyl, paper, lab );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.60, 0.58, 0.54 ), dust * 0.9 );
          roughnessFactor = mix( mix( 0.085, 0.58, lab ), 0.92, max( dust, max( scr, etch ) * 0.7 ) );

          gCov = cov * ( 1.0 - dust );
          gLoud = gd.b;
          gSigma = sqrt( 0.0020 + pow( mix( 0.022, 0.15, gd.b ), 2.0 ) );
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          vec3 fan = vec3( 0.0 );
          #ifdef USE_ENVMAP
          if ( gCov > 0.0005 ) {
            float wsum = 0.0;
            float jit = ( fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) - 0.5 ) * 0.15;
            float er = mix( 0.24, 0.48, gLoud );
            for ( int k = 0; k < 12; k ++ ) {
              float a = ( float( k ) - 5.5 ) * 0.15 + jit;
              vec3 n = normalize( cos( a ) * gN + sin( a ) * gR );
              float nv = dot( n, geometryViewDir );
              vec3 rf = reflect( - geometryViewDir, n );
              float vis = smoothstep( -0.02, 0.22, dot( rf, gN ) ) * smoothstep( 0.0, 0.15, nv );
              float wk = fanW( a );
              float F = 0.045 + 0.955 * pow( 1.0 - clamp( nv, 0.0, 1.0 ), 5.0 );
              fan += getIBLRadiance( geometryViewDir, n, er ) * ( wk * vis * F );
              wsum += wk;
            }
            fan *= uFan / wsum;
          }
          #endif
          float land = 1.0 - gCov;
          reflectedLight.directSpecular = reflectedLight.directSpecular * land + gDirect;
          reflectedLight.indirectSpecular = reflectedLight.indirectSpecular * land + fan * gCov;
        }`);
  };
  mat.customProgramCacheKey = () => 'groove-deck-vinyl-6';

  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  offset.add(mesh);

  let grooveTex = null, wearTex = null, artToken = 0, current = null;

  function setSide(side, onArt) {
    current = side;
    if (grooveTex) { grooveTex.dispose(); grooveTex = null; }
    if (wearTex) { wearTex.dispose(); wearTex = null; }
    if (!side) { group.visible = false; return; }
    const f = side.fmt;
    mesh.geometry.dispose();
    mesh.geometry = discGeometry(f);
    const gd = grooveData(side);
    grooveTex = gd.tex;
    U.uGroove.value = gd.tex; U.uGrooveW.value = DATA_W; U.uGrooveR.value.set(gd.rMin, gd.rMax);
    U.uLabelR.value = f.label; U.uDiscR.value = f.disc; U.uLockR.value = side.radii[side.turns];
    wearTex = wearTexture(side); U.uWearMap.value = wearTex;
    // every pressing warps a little differently: the view sets this side's own warp (setWarp)
    const seed = (side.turns * 7919 + Math.round(side.radii[side.turns] * 1e6)) % 1000;
    U.uWA.value.set(0.00022 * (f.disc / 0.15), 0.00009 * (f.disc / 0.15), 0); U.uWN.value.set(1, 2, 1); U.uWP.value.set((seed % 63) / 10, ((seed * 7) % 63) / 10, 0);
    drawLabel(labelCanvas, side, null); labelTex.needsUpdate = true;
    const token = ++artToken;
    if (side.artUrl) {
      const img = new Image();
      img.onload = () => { if (token === artToken && current === side) { drawLabel(labelCanvas, side, img); labelTex.needsUpdate = true; if (onArt) onArt(); } };
      img.src = side.artUrl;
    }
    group.visible = true;
  }

  // Height of the warped surface (metres above flat) at a point given in the record's own frame.
  function warpAt(r, theta) {
    const a = U.uWA.value, n = U.uWN.value, p = U.uWP.value, R = U.uDiscR.value;
    return ((r * r) / (R * R)) * (a.x * Math.cos(n.x * theta - p.x) + a.y * Math.cos(n.y * theta - p.y) + a.z * Math.cos(n.z * theta - p.z));
  }

  // The warp the sound engine plays (dsp.js discFlaws), times the Workbench's Record warp slider.
  // The engine's height under the stylus is warp * (sin(nθ+φ0) + 0.15 sin(3nθ+φ1) + 0.04 sin(5nθ+φ2))
  // with θ the disc's turn; the stylus sits at angle sAng, so the point of the record under it
  // is at sAng - θ in the record's own frame. Written in that frame, each wave becomes
  // a cos(m·angle - (m·sAng + φ - π/2)): the high spots pass the stylus when the sound sways.
  // (Drawn rising towards the rim, as a real warp does; the sound takes the full height.)
  // Ported from the main Groove Deck (violet-lichen).
  function setWarp(flaws, scale, sAng) {
    if (!flaws) return;
    const A = flaws.warp * scale, n = flaws.lobes, ph = flaws.phase, h = Math.PI / 2;
    U.uWA.value.set(A, 0.15 * A, 0.04 * A);
    U.uWN.value.set(n, 3 * n, 5 * n);
    U.uWP.value.set(n * sAng + ph[0] - h, 3 * n * sAng + ph[1] - h, 5 * n * sAng + ph[2] - h);
  }

  return { group, offset, mesh, uniforms: U, setSide, setWarp, warpAt, get side() { return current; } };
}

