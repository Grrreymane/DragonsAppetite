// 岛模块冒烟测试：随便一个页面，等 4 秒存一张图（看有没有着色器报错）
await new Promise(r => setTimeout(r, 4000));
await __shot('smoke');
await __done();
