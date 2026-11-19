// Universal Audio WB-19 walnut cabinet. The band crosses the front in catalog
// B-L-174, p.4 E. Its material and the individual flitches are unmeasured.
import * as THREE from 'three';

// Smooth value noise keeps the broad grain flowing. Separate scales provide
// the growth-ring figure, fine fibres and pores instead of hundreds of drawn
// parallel dark lines. No photographic shading is baked into the colour.
function noise(seed) {
  const hash = (x, y) => {
    let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  return (x, y) => {
    const ix=Math.floor(x), iy=Math.floor(y), a=x-ix, b=y-iy;
    const u=a*a*(3-2*a), v=b*b*(3-2*b);
    const lo=hash(ix,iy)*(1-u)+hash(ix+1,iy)*u;
    const hi=hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u;
    return lo*(1-v)+hi*v;
  };
}

export function createWalnutVeneer({ width=2048, height=512, seed=1229 }={}) {
  const coarse=noise(seed), detail=noise(seed+71), fibre=noise(seed+193);
  const canvases=Array.from({length:3},()=>{
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;
  });
  const contexts=canvases.map(c=>c.getContext('2d'));
  const images=contexts.map(c=>c.createImageData(width,height));
  const [colourPixels,roughPixels,bumpPixels]=images.map(i=>i.data);
  const byte=v=>Math.round(Math.max(0,Math.min(255,v)));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const u=(x+.5)/width, v=(y+.5)/height;
    // A shallow tangential cut gives broad cathedral arches rather than a
    // knot repeated down the board. Slow drift prevents a synthetic parabola.
    const drift=(coarse(u*3.1,v*2.2)-.5)*.19;
    const cross=v+.08+drift+.065*Math.sin(u*7.0+.7);
    const depth=.15+.34*Math.pow((u-.56)*1.8,2)+.05*(coarse(u*4.5,2)-.5);
    const cut=Math.sqrt(cross*cross+depth*depth);
    // Irregular growth rate and interrupted latewood avoid a series of evenly
    // spaced contours. Broad earlywood figure remains visible at seated scale.
    const phase=cut*17+(coarse(u*4.2,cut*8)-.5)*2.2;
    const ring=Math.sin(phase*Math.PI*2);
    const latewood=Math.pow(Math.max(0,ring),5)*(.35+.65*detail(u*4,cut*11));
    const broad=(coarse(u*2.2,v*3.3)-.5)*31;
    const figure=(detail(u*3.2,cut*10)-.5)*38;
    // Short irregular ribbons of dark fibre interrupt the long cathedral figure.
    const fleck=Math.max(0,(fibre(u*26,cut*65)-.41)/.59);
    const cloud=(detail(u*13,v*28)-.5)*7 - fleck*fleck*17;
    const fine=(fibre(u*70,phase*7)-.5)*3.5;
    // Discontinuous fibres stretch along the grain, not across it. They are
    // low contrast in albedo but remain visible in the separate relief map.
    const pores=Math.max(0,(fibre(u*105,phase*12)-.68)/.32);
    const pore=pores*pores*(.4+.6*detail(u*21,v*17));
    const tone=broad+figure+cloud+fine-latewood*14-pore*12;
    const i=(y*width+x)*4;
    colourPixels[i]=byte(146+tone);
    colourPixels[i+1]=byte(82+tone*.77+(coarse(u*4,v*5)-.5)*3);
    colourPixels[i+2]=byte(42+tone*.52);
    colourPixels[i+3]=255;
    // Data textures: roughness in linear space and height centered about 0.5.
    // Neither is made by treating the coloured wood image as topography.
    const rough=byte(255*(.49+.055*latewood+.07*pore+(detail(u*28,v*52)-.5)*.025));
    const relief=byte(128-latewood*11-pore*42+fine*1.7);
    for(let c=0;c<3;c++){roughPixels[i+c]=rough;bumpPixels[i+c]=relief;}
    roughPixels[i+3]=bumpPixels[i+3]=255;
  }
  contexts.forEach((c,i)=>c.putImageData(images[i],0,0));
  const textures=canvases.map((canvas,i)=>{
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=i===0?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
    texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
    texture.anisotropy=8;
    return texture;
  });
  // The front rail alone has this dark band. It spans about 5–6% of the
  // front height in the catalog photograph. The small existing CAD recess
  // falls within it. Preserve the continuous physical front surface.
  const frontCanvas=document.createElement('canvas');
  frontCanvas.width=width; frontCanvas.height=height;
  const frontContext=frontCanvas.getContext('2d');
  frontContext.drawImage(canvases[0],0,0);
  frontContext.fillStyle='#382920';
  frontContext.fillRect(0,height*.67,width,height*.055);
  const frontColour=textures[0].clone();
  frontColour.source=new THREE.Source(frontCanvas);
  frontColour.needsUpdate=true;
  return { colour:textures[0], frontColour, roughness:textures[1], bump:textures[2],
    report:{width,height,seed,basis:'procedural walnut accessory finish; estimated appearance; no baked illumination',
      mapping:'one non-repeating board; grain runs along U; neutral material tint; linear roughness and bump maps'},
    dispose(){frontColour.dispose();for(const texture of textures)texture.dispose();} };
}
