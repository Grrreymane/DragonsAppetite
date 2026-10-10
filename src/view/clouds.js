// 云和火山烟：实例化公告板（一次绘制画很多张朝向镜头的贴图）。按 PERIOD 循环。
import * as THREE from 'three';
import { PERIOD, wrapP } from '../sim/world.js';
import { makeRng } from '../sim/rng.js';

// ---------- 软软的贴图（云、烟） ----------
function puffTex(warm, seed) {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), rnd = makeRng(seed);
  for (let i = 0; i < 9; i++) {
    const x = S * (.3 + rnd() * .4), y = S * (.35 + rnd() * .3), r = S * (.18 + rnd() * .16);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, warm ? 'rgba(120,110,105,.55)' : 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// 实例化公告板：一次绘制画很多张朝向镜头的贴图（云、烟）
function billboards(tex, max) {
  const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
  const off = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const sz = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
  const col = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iOff', off); geo.setAttribute('iSize', sz); geo.setAttribute('iCol', col);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: tex } }]),
    vertexShader: `attribute vec3 iOff; attribute vec2 iSize; attribute vec4 iCol; varying vec2 vUv; varying vec4 vC;
      #include <fog_pars_vertex>
      void main(){
        vUv = uv; vC = iCol;
        vec4 mvPosition = viewMatrix * vec4(iOff, 1.0);
        mvPosition.xy += position.xy * iSize;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec4 vC;
      #include <fog_pars_fragment>
      void main(){
        vec4 t = texture2D(map, vUv);
        gl_FragColor = vec4(t.rgb * vC.rgb, t.a * vC.a);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
  let n = 0;
  return {
    mesh,
    begin() { n = 0; },
    push(x, y, z, w, h, r, g, b, a) {
      if (n >= max) return;
      off.array[n * 3] = x; off.array[n * 3 + 1] = y; off.array[n * 3 + 2] = z;
      sz.array[n * 2] = w; sz.array[n * 2 + 1] = h;
      col.array[n * 4] = r; col.array[n * 4 + 1] = g; col.array[n * 4 + 2] = b; col.array[n * 4 + 3] = a; n++;
    },
    end() { geo.instanceCount = n; off.needsUpdate = sz.needsUpdate = col.needsUpdate = true; },
  };
}

export function createClouds({ scene }) {
  const rnd = makeRng(4242);
  const clouds = [];
  for (let i = 0; i < 34; i++) {
    const n = 4 + rnd.int(0, 4), w = rnd.range(20, 45), puffs = [];
    for (let k = 0; k < n; k++) { const s = rnd.range(.6, 1) * w * 1.6; puffs.push({ x: rnd.range(-w, w), y: rnd.range(-w, w) * .15, z: rnd.range(-w, w) * .5, w: s * 1.6, h: s, c: rnd.range(.92, 1), a: rnd.range(.75, .95) }); }
    clouds.push({ x: rnd.range(-PERIOD / 2, PERIOD / 2), y: rnd.range(45, 150), z: rnd.range(-PERIOD / 2, PERIOD / 2), drift: rnd.range(1.5, 4), puffs });
  }
  const cloudBB = billboards(puffTex(false, 11), 300); scene.add(cloudBB.mesh);
  const smokeBB = billboards(puffTex(true, 23), 200); scene.add(smokeBB.mesh); smokeBB.mesh.renderOrder = 1;
  return {
    // smokePoints：[{x,y,z,id}] 火山口位置（islands.smokePoints()）
    update(camera, time, dt, smokePoints = []) {
      const cx = camera.position.x, cz = camera.position.z;
      cloudBB.begin();
      for (const cl of clouds) {
        cl.x += cl.drift * dt;
        const x = cx + wrapP(cl.x - cx), z = cz + wrapP(cl.z - cz);
        if (Math.hypot(x - cx, z - cz) > 1000) continue;
        for (const p of cl.puffs) cloudBB.push(x + p.x, cl.y + p.y, z + p.z, p.w, p.h, p.c, p.c, p.c, p.a);
      }
      cloudBB.end();
      smokeBB.begin();
      for (const sp of smokePoints) {
        for (let k = 0; k < 7; k++) {
          const t = (time * .05 + k / 7 + sp.id * .13) % 1, sz = 25 + (k * 37 % 15);
          smokeBB.push(sp.x + Math.sin(t * 5) * 4 + t * 30, sp.y + t * 90, sp.z + t * 12, sz * (.4 + t * 1.6), sz * (.4 + t * 1.6), 1, 1, 1, Math.sin(Math.PI * t) * .55);
        }
      }
      smokeBB.end();
    },
  };
}
