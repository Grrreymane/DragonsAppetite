// 海的截图：7 个机位（高空 / 掠水 / 水线 / 翠岛 -8 / 火山 -40 / 外海 -80 / 水下仰望鸟影）
const wait = () => new Promise(r => { const k = () => window.__labReady ? r() : setTimeout(k, 50); k(); });
await wait();
const L = window.__lab;
const names = ['高空', '掠水', '水线', '翠岛', '火山', '外海', '仰望'];
const files = ['1_high', '2_skim', '3_waterline', '4_green-8', '5_volcano-40', '6_open-80', '7_lookup-10'];
for (let i = 0; i < names.length; i++) {
  L.view(names[i]);
  for (let f = 0; f < 45; f++) L.tick(1 / 60);
  if (names[i] === '水线') L.view(names[i]);       // 水线高度按当前浪重新算一次
  L.tick(1 / 60); L.render();
  const r = L.info();
  __log(`${files[i]} under=${L.sea.underwater.toFixed(2)} tris=${r.triangles} calls=${r.calls} fog=${L.scene.fog ? L.scene.fog.near.toFixed(0) + '..' + L.scene.fog.far.toFixed(0) : '-'}`);
  await __shot(files[i]);
}
await __done();
