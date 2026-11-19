// The strobe ring (225 222) under the platter: two rows of black bars, rendered with assumed
// counts of 216 for 33 1/3 and 160 for 45 (D3, D16). These counts and the optical flash rate
// remain unverified; plain 1229 manual p.5 Fig.7 does not justify AC frequency doubling.
// It turns with the platter (it sits in platSpin),
// and where the neon lamp lights it the bars are drawn as the flashes show them, from the deck
// view's strobe uniforms: they stand still at exact speed and creep when the speed is off.
// Owned by the platter builder (see OWNERS.md).
//
// Uniforms (the deck view sets them every frame through model.platterUniforms):
//   uTrue   (platter angle in turns, blur of the 33 row, blur of the 45 row, lamp 0..1)
//   uStrobe (phase of the 33 row as the flashes show it, its blur, the same for the 45 row)
//   uLampU  where the lamp is, as a fraction of a turn in the ring's own u (lathe convention:
//           u = 0 on +z, increasing toward +x)
import * as THREE from 'three';
import { STROBE } from '../../../../deck3d/layout.js';
import { TAU } from '../../layout.js';

// A flat ring facing down, u round the ring (lathe convention, so u matches the lamp's uLampU and
// the platter's turn), v from the inner edge (0) to the outer (1).
export function ringGeo(rIn, rOut, y, segments = 432) {
  const pos = [], uv = [], nor = [], idx = [];
  for (let i = 0; i <= segments; i++) {
    const phi = (i / segments) * TAU, s = Math.sin(phi), c = Math.cos(phi);
    for (const [j, r] of [[0, rIn], [1, rOut]]) { pos.push(s * r, y, c * r); uv.push(i / segments, j); nor.push(0, -1, 0); }
  }
  for (let i = 0; i < segments; i++) { const a = i * 2, b = a + 1, c = a + 3, d = a + 2; idx.push(a, c, b, a, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// The ring's paper with its bars. A subclass so that a clone (X-ray highlighting clones a part's
// material) keeps the bars and the uniforms.
export class StrobeRingMaterial extends THREE.MeshStandardMaterial {
  constructor(params, SU, rows) {
    super(params);
    this.SU = SU; this.rows = rows;
    if (SU) this.onBeforeCompile = (sh) => this.inject(sh);
  }
  copy(src) {
    super.copy(src);
    this.SU = src.SU; this.rows = src.rows;
    if (src.SU) this.onBeforeCompile = (sh) => this.inject(sh);
    return this;
  }
  customProgramCacheKey() { return 'dual1229-strobe-ring-1'; }
  inject(sh) {
    Object.assign(sh.uniforms, this.SU);
    const f = (x) => x.toFixed(4), [a0, a1] = this.rows[45], [b0, b1] = this.rows[33];
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <clipping_planes_pars_fragment>', `#include <clipping_planes_pars_fragment>
        varying vec2 vRUv; uniform vec4 uTrue; uniform vec4 uStrobe; uniform float uLampU;
        float pulse1( float x, float d ) { return floor( x ) * d + min( fract( x ), d ); }
        float dotRow( float x, float d, float w ) { w = max( w, 1e-3 ); float a = fract( x + 0.5 * d - 0.5 * w ) + 1.0; return ( pulse1( a + w, d ) - pulse1( a, d ) ) / w; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float u = vRUv.x, v = vRUv.y, fw = fwidth( u ), fv = fwidth( v ) + 0.01;
          float uw = fract( u - uTrue.x ); // where on the deck this point of the ring is now
          float row45 = smoothstep( ${f(a0)}, ${f(a0)} + fv, v ) * ( 1.0 - smoothstep( ${f(a1)} - fv, ${f(a1)}, v ) );
          float row33 = smoothstep( ${f(b0)}, ${f(b0)} + fv, v ) * ( 1.0 - smoothstep( ${f(b1)} - fv, ${f(b1)}, v ) );
          // what is printed (blurred by the turning), and what the flashes show
          float t33 = dotRow( ${STROBE.dots33}.0 * u, 0.5, max( ${STROBE.dots33}.0 * fw, uTrue.y ) );
          float t45 = dotRow( ${STROBE.dots45}.0 * u, 0.5, max( ${STROBE.dots45}.0 * fw, uTrue.z ) );
          float s33 = dotRow( ${STROBE.dots33}.0 * uw + uStrobe.x, 0.5, max( ${STROBE.dots33}.0 * fw, uStrobe.y ) );
          float s45 = dotRow( ${STROBE.dots45}.0 * uw + uStrobe.z, 0.5, max( ${STROBE.dots45}.0 * fw, uStrobe.w ) );
          float du = abs( fract( uw - uLampU + 0.5 ) - 0.5 );
          float lamp = exp( - pow( du / 0.035, 2.0 ) ) * uTrue.w;
          float k = clamp( lamp * 1.6, 0.0, 1.0 );
          float bars = row33 * ( 1.0 - mix( t33, s33, k ) ) + row45 * ( 1.0 - mix( t45, s45, k ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.025 ), bars );
          roughnessFactor = mix( roughnessFactor, 0.55, bars );
          totalEmissiveRadiance += vec3( 1.0, 0.27, 0.07 ) * lamp * ( 1.0 - bars ) * 0.9;
        }`);
  }
}
