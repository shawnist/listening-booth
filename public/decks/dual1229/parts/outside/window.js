// The strobe window's picture (46, D16): through the deflecting prism the window looks at the strobe
// ring under the platter where the neon lights it, and shows its two rows of bars, 45 above 33. The
// bars are drawn here from the same uniforms the platter's ring uses (published by the platter as
// kit.anchors.strobeRing), so the window shows what the ring shows: standing still at exact speed with
// the lamp on, creeping with the pitch. Owned by the outside builder (see OWNERS.md).
import * as THREE from 'three';
import { STROBE } from '../../../../deck3d/layout.js';

// How much of the ring the window shows: the prism images about 2.6 mm of the ring for every mm of
// window, so the 33 row shows about ten bars across (E, from the lit photos dFn 2:22 and bXv 3:15).
export const VIEW = { arcPerMm: 2.6, rowGap: 0.45, rowH: 2.1, halfW: 6.6 }; // mm on the window

// A window-sized disc material. uniforms: { uTrue, uStrobe, uLampU } as the platter publishes them
// (their .value objects are shared once the window is bound); radius of the window (m); the radii of
// the two rows on the ring (m).
export class StrobeWindowMaterial extends THREE.MeshStandardMaterial {
  constructor(params, WU, geom) {
    super(params);
    this.WU = WU; this.geom = geom;
    if (WU) this.onBeforeCompile = (sh) => this.inject(sh);
  }
  copy(src) {
    super.copy(src);
    this.WU = src.WU; this.geom = src.geom;
    if (src.WU) this.onBeforeCompile = (sh) => this.inject(sh);
    return this;
  }
  customProgramCacheKey() { return `dual1229-strobe-window-${this.geom.r.toFixed(5)}-${this.geom.r33.toFixed(4)}-${this.geom.r45.toFixed(4)}`; }
  inject(sh) {
    Object.assign(sh.uniforms, this.WU);
    const f = (x) => Number(x).toFixed(5), G = this.geom, V = VIEW;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <clipping_planes_pars_fragment>', `#include <clipping_planes_pars_fragment>
        varying vec2 vWUv; uniform vec4 uTrue; uniform vec4 uStrobe; uniform float uLampU;
        float wPulse( float x, float d ) { return floor( x ) * d + min( fract( x ), d ); }
        float wRow( float x, float d, float w ) { w = max( w, 1e-3 ); float a = fract( x + 0.5 * d - 0.5 * w ) + 1.0; return ( wPulse( a + w, d ) - wPulse( a, d ) ) / w; }
        float glowMask = 0.0;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          // window coordinates in mm: x to the right, y toward the back (up in the window)
          vec2 w = ( vWUv - 0.5 ) * ${f(2 * G.r * 1000)};
          float fy = fwidth( w.y ) + 0.05, fx = fwidth( w.x );
          float in45 = smoothstep( ${f(V.rowGap)}, ${f(V.rowGap)} + fy, w.y ) * ( 1.0 - smoothstep( ${f(V.rowGap + V.rowH)} - fy, ${f(V.rowGap + V.rowH)}, w.y ) );
          float in33 = smoothstep( ${f(V.rowGap)}, ${f(V.rowGap)} + fy, -w.y ) * ( 1.0 - smoothstep( ${f(V.rowGap + V.rowH)} - fy, ${f(V.rowGap + V.rowH)}, -w.y ) );
          float ends = 1.0 - smoothstep( ${f(V.halfW - 1.2)}, ${f(V.halfW)}, abs( w.x ) ); // the prism's aperture
          // where on the deck each point of the rows looks (turns, lathe convention, as the ring's shader)
          float a33 = w.x * ${f(V.arcPerMm)} / ${f(Math.PI * 2 * G.r33 * 1000)}, a45 = w.x * ${f(V.arcPerMm)} / ${f(Math.PI * 2 * G.r45 * 1000)};
          float uw33 = uLampU + a33, uw45 = uLampU + a45;
          float px33 = ${STROBE.dots33}.0 * fx * ${f(V.arcPerMm)} / ${f(Math.PI * 2 * G.r33 * 1000)};
          float px45 = ${STROBE.dots45}.0 * fx * ${f(V.arcPerMm)} / ${f(Math.PI * 2 * G.r45 * 1000)};
          // printed (blurred by the turning) and as the flashes show it
          float t33 = wRow( ${STROBE.dots33}.0 * ( uw33 + uTrue.x ), 0.5, max( px33, uTrue.y ) );
          float t45 = wRow( ${STROBE.dots45}.0 * ( uw45 + uTrue.x ), 0.5, max( px45, uTrue.z ) );
          float s33 = wRow( ${STROBE.dots33}.0 * uw33 + uStrobe.x, 0.5, max( px33, uStrobe.y ) );
          float s45 = wRow( ${STROBE.dots45}.0 * uw45 + uStrobe.z, 0.5, max( px45, uStrobe.w ) );
          float k = clamp( uTrue.w * 1.6, 0.0, 1.0 );
          float paper33 = mix( t33, s33, k ), paper45 = mix( t45, s45, k );
          float rows = ( in33 + in45 ) * ends;
          float paper = in33 * paper33 + in45 * paper45;
          // unlit: the ring is only just made out in the dark of the prism; lit: orange-red paper, black bars
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.010 + 0.022 * paper ), rows * ( 1.0 - k ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.02 ), rows * k );
          glowMask = rows * paper;
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= glowMask;');
  }
}
