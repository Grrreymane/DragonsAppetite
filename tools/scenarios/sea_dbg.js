const wait = () => new Promise(r => { const k = () => window.__labReady ? r() : setTimeout(k, 50); k(); });
await wait();
const L = window.__lab, u = L.sea.group.children[0].material.uniforms;
L.view('高空'); for (let f = 0; f < 30; f++) L.tick(1 / 60);
__log('N=' + u.uShN.value + ' ' + u.uShA.value.slice(0, u.uShN.value).map((a, i) => [a.x, a.y, a.z, a.w, u.uShB.value[i].z, u.uShB.value[i].w].map(v => v.toFixed(2)).join(',')).join(' | '));
await __done();
