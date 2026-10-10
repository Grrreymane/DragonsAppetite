// 备用的简单实现：正式模块（生物 / 海 / 界面 / 声音）加载失败时顶上，保证游戏照样能玩。
import * as THREE from 'three';
import { SPECIES, SPECIES_IDS, GOLD } from '../config/species.js';
import { WAVE_GLSL } from '../sim/world.js';
import { STAGE_PTS } from '../config/dragons.js';

export function fallbackCreatures({ scene, GRAD, outlineMat }) {
  const meshes = {};
  const geo = new THREE.OctahedronGeometry(.5, 0).scale(.6, .45, 1);
  for (const id of SPECIES_IDS) {
    const d = SPECIES[id];
    const m = new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({ color: d.colors.body, gradientMap: GRAD }), d.max + 40);
    const h = new THREE.InstancedMesh(geo, outlineMat(0x221a14, .06), d.max + 40);
    m.count = h.count = 0; m.frustumCulled = h.frustumCulled = false; scene.add(m, h); meshes[id] = { m, h };
  }
  const o = new THREE.Object3D(), col = new THREE.Color();
  return {
    update(S, alpha) {
      const n = {}; for (const id of SPECIES_IDS) n[id] = 0;
      for (const c of S.creatures) {
        const M = meshes[c.sp]; if (!M) continue; const i = n[c.sp]++; if (i >= M.m.instanceMatrix.count) continue;
        o.position.set(c.px + (c.x - c.px) * alpha, c.py + (c.y - c.py) * alpha, c.pz + (c.z - c.pz) * alpha);
        o.rotation.set(-c.pitch, c.yaw, c.roll, 'YXZ'); o.scale.setScalar(Math.max(.001, c.size)); o.updateMatrix();
        M.m.setMatrixAt(i, o.matrix); M.h.setMatrixAt(i, o.matrix);
        M.m.setColorAt(i, col.set(c.gold ? GOLD : c.roast > 0 ? 0xc06020 : SPECIES[c.sp].colors.body));
      }
      for (const id of SPECIES_IDS) { const M = meshes[id]; M.m.count = M.h.count = n[id]; M.m.instanceMatrix.needsUpdate = M.h.instanceMatrix.needsUpdate = true; if (M.m.instanceColor) M.m.instanceColor.needsUpdate = true; }
    },
    setUnderwater() { }, portrait() { return ''; },
  };
}

export function fallbackSea({ scene }) {
  const mat = new THREE.ShaderMaterial({
    fog: true, side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 } }]),
    vertexShader: `uniform float uT; varying vec3 vW; ${WAVE_GLSL}
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); w.y += waveH(w.xz, uT); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `varying vec3 vW;
      #include <fog_pars_fragment>
      void main(){ vec3 c = mix(vec3(.06,.31,.45), vec3(.17,.56,.68), clamp(vW.y*.25+.4,0.,1.)); gl_FragColor = vec4(c,1.);
      #include <colorspace_fragment>
      #include <fog_fragment>
      }`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 120, 120).rotateX(-Math.PI / 2), mat);
  sea.frustumCulled = false; scene.add(sea);
  const F = { underwater: 0 };
  F.update = (S, alpha, dt, time, camera) => {
    mat.uniforms.uT.value = time;
    if (camera) sea.position.set(Math.round(camera.position.x / 20) * 20, 0, Math.round(camera.position.z / 20) * 20);
  };
  return F;
}

export function fallbackUI(root, api) {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;pointer-events:none;color:#fff;font:16px/1.4 var(--px-font);text-shadow:0 1px 3px #000';
  el.innerHTML = `<div id="fbT" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;pointer-events:auto;background:rgba(10,20,40,.35)">
    <b style="font:40px var(--title-font)">龙游天海</b>
    <button data-k="fire" style="font:20px var(--title-font);padding:12px 28px;border-radius:14px;border:0;background:#e2552a;color:#fff">火龙</button>
    <button data-k="sea" style="font:20px var(--title-font);padding:12px 28px;border-radius:14px;border:0;background:#1f8a9a;color:#fff">海龙</button></div>
    <div id="fbH" style="display:none;position:absolute;top:calc(12px + env(safe-area-inset-top));left:12px;right:12px"><div id="fbBar" style="height:10px;border-radius:5px;background:rgba(0,0,0,.35);overflow:hidden"><i style="display:block;height:100%;width:0;background:#ffd04a"></i></div><div id="fbG" style="margin-top:6px"></div></div>
    <button id="fbA" style="display:none;position:absolute;right:16px;bottom:calc(22px + env(safe-area-inset-bottom));width:88px;height:88px;border-radius:50%;border:0;background:#e2552a;color:#fff;font:18px var(--title-font);pointer-events:auto">喷火</button>
    <div id="fbToast" style="position:absolute;top:38%;left:0;right:0;text-align:center;font:36px var(--title-font);opacity:0;transition:opacity .4s"></div>`;
  root.appendChild(el);
  const $ = s => el.querySelector(s);
  el.querySelectorAll('[data-k]').forEach(b => b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); api.onPick(b.dataset.k); }));
  const A = $('#fbA');
  A.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); api.onAction(true); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) A.addEventListener(ev, () => api.onAction(false));
  let toastT = 0;
  return {
    showTitle() { $('#fbT').style.display = 'flex'; $('#fbH').style.display = 'none'; A.style.display = 'none'; },
    hideTitle() { $('#fbT').style.display = 'none'; },
    showHUD(kind) { $('#fbH').style.display = 'block'; A.style.display = 'block'; A.textContent = kind === 'fire' ? '喷火' : '冲刺'; },
    hideHUD() { $('#fbH').style.display = 'none'; A.style.display = 'none'; },
    update(S, dt) {
      const s = S.stage, a = STAGE_PTS[s], b = STAGE_PTS[s + 1] || a + 1;
      $('#fbBar i').style.width = Math.min(100, (S.pts - a) / (b - a) * 100) + '%';
      const g = S.goal; $('#fbG').textContent = g ? `${g.sp ? SPECIES[g.sp].zh : g.type} ${g.have}/${g.n}` : '';
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('#fbToast').style.opacity = 0; }
    },
    toast(t) { const T = $('#fbToast'); T.textContent = t; T.style.opacity = 1; toastT = 1.2; },
    showPause() { }, hidePause() { }, showCodex() { }, showResult(info, cb) { cb && cb(); }, hint() { }, setLoading() { }, setTemp() { }, setMute() { }, setLeft() { }, dragging() { },
  };
}

export function fallbackAudio() {
  return { unlock() { }, setMute() { }, muted: false, update() { } };
}
