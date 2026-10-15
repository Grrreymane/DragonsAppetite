// 速度感：镜头周围一团「空气里的线」——固定在世界里的点，龙飞过时它们从镜头旁边掠过，拉成沿速度方向的细线。
// 平飞时很淡，俯冲 / 冲刺时又多又长又亮。水下换成淡蓝的气泡线。一次绘制。
import * as THREE from 'three';

const N = 110;
export function createSpeedFx({ scene }) {
  const geo = new THREE.InstancedBufferGeometry();
  // 底板：x ∈ {0,1} 沿线段，y ∈ {-1,1} 横向
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const iA = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const iB = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const iW = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2).setUsage(THREE.DynamicDrawUsage);   // 宽度、透明度
  geo.setAttribute('iA', iA); geo.setAttribute('iB', iB); geo.setAttribute('iW', iW);
  geo.instanceCount = 0;
  const U = { uCol: { value: new THREE.Color(1, 1, 1) } };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: U,
    vertexShader: `attribute vec3 iA, iB; attribute vec2 iW; varying float vT, vS, vA;
      void main(){
        vec4 a = viewMatrix * vec4(iA, 1.0), b = viewMatrix * vec4(iB, 1.0);
        vec3 p = mix(a.xyz, b.xyz, position.x);
        vec3 d = normalize(b.xyz - a.xyz + vec3(1e-4));
        vec3 s = normalize(cross(d, normalize(p)));
        p += s * position.y * iW.x * max(1.0, -p.z * .06);   // 远的线不会细到看不见
        vT = position.x; vS = position.y; vA = iW.y;
        gl_Position = projectionMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform vec3 uCol; varying float vT, vS, vA;
      void main(){
        float a = vA * smoothstep(0.0, 0.35, vT) * smoothstep(1.0, 0.75, vT) * (1.0 - abs(vS));
        if (a < 0.01) discard;
        gl_FragColor = vec4(uCol, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 3; scene.add(mesh);
  const pts = Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0, age: 0, live: false }));
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), v = new THREE.Vector3();
  let k = 0;
  return {
    // h：插值后的主角（speed、yaw、pitch）；sf：0..1 速度系数（俯冲 / 冲刺接近 1）；under：镜头在水下
    update(camera, h, sf, under, dt) {
      const cp = Math.cos(h.pitch);
      v.set(Math.sin(h.yaw) * cp, Math.sin(h.pitch), Math.cos(h.yaw) * cp);          // 运动方向
      camera.getWorldDirection(fwd); right.crossVectors(fwd, camera.up).normalize(); up.crossVectors(right, fwd);
      k += ((.3 + .7 * sf) - k) * Math.min(1, dt * 3);                              // 强度：平飞 0.25 → 俯冲 1
      const want = Math.round(N * (.35 + .65 * k)), c = camera.position;
      U.uCol.value.set(under ? 0xcdf4ff : 0xffffff);
      const len = Math.max(2, h.speed * (.08 + .1 * k));
      let n = 0;
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
        const ahead = dx * fwd.x + dy * fwd.y + dz * fwd.z;
        if (!p.live || ahead < 1 || dx * dx + dy * dy + dz * dz > 75 * 75) {
          if (i >= want) { p.live = false; continue; }
          // 在镜头前方 15~60 米的锥里重新放；不放在正中间（龙在那）
          const d = 8 + Math.random() * 34, a = Math.random() * Math.PI * 2, r = (.45 + Math.random() * .55) * d * .6;   // 偏屏幕四周
          p.x = c.x + fwd.x * d + (right.x * Math.cos(a) + up.x * Math.sin(a)) * r;
          p.y = c.y + fwd.y * d + (right.y * Math.cos(a) + up.y * Math.sin(a)) * r;
          p.z = c.z + fwd.z * d + (right.z * Math.cos(a) + up.z * Math.sin(a)) * r;
          p.age = 0; p.live = true;
        }
        p.age += dt;
        const fade = Math.min(1, p.age * 2.5);
        iA.array[n * 3] = p.x; iA.array[n * 3 + 1] = p.y; iA.array[n * 3 + 2] = p.z;
        iB.array[n * 3] = p.x - v.x * len; iB.array[n * 3 + 1] = p.y - v.y * len; iB.array[n * 3 + 2] = p.z - v.z * len;
        iW.array[n * 2] = under ? .06 : .05 + .04 * k; iW.array[n * 2 + 1] = (under ? .45 : .75) * k * fade;
        n++;
      }
      geo.instanceCount = n; iA.needsUpdate = iB.needsUpdate = iW.needsUpdate = true;
    },
  };
}
