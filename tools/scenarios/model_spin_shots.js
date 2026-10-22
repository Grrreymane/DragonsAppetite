// 模型检查页（_lab/model-lab.html?m=…）自动转：每隔一段时间截一张，拿到几个角度
await new Promise(r => setTimeout(r, 4000));
document.getElementById('info').style.display = 'none';
for (let i = 0; i < 6; i++) { await __shot('v' + i); await new Promise(r => setTimeout(r, 1300)); }
await __done();
