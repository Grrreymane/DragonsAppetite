// 天空、光、雾（从原型搬过来）。水下时由 sea.js 改雾，这里只管天上。
import * as THREE from 'three';

export const SUN = new THREE.Vector3(-.35, .62, -.7).normalize();
export const SKY = { top: new THREE.Color(0x3d78c6), mid: new THREE.Color(0xc8dcec), bot: new THREE.Color(0xe9d7c2), sun: new THREE.Color(0xfff1d0) };

export function createSky({ scene, renderer }) {
  scene.fog = new THREE.Fog(SKY.mid.clone(), 180, 900);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: SKY.top }, mid: { value: SKY.mid }, bot: { value: SKY.bot }, sunC: { value: SKY.sun }, sunD: { value: SUN } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, mid, bot, sunC, sunD; varying vec3 vP;
      void main(){
        float h = vP.y;
        vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, h)) : mix(mid, bot, smoothstep(0.0, -0.2, h));
        float s = max(dot(normalize(vP), sunD), 0.0);
        c += sunC * (pow(s, 600.0) * 2.5 + pow(s, 12.0) * 0.25);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  {
    const pm = new THREE.PMREMGenerator(renderer), s2 = new THREE.Scene();
    s2.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat));
    scene.environment = pm.fromScene(s2, .02).texture; pm.dispose();
  }
  const hemi = new THREE.HemisphereLight(0xdcecff, 0x6b5a4a, .9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6); sun.position.copy(SUN).multiplyScalar(100); scene.add(sun);
  return {
    sky, hemi, sun,
    update(camera) { sky.position.copy(camera.position); },
  };
}
