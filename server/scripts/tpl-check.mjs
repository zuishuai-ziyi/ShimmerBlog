import { pool } from '../src/db.js';
import { mailTemplate } from '../src/services/settings.js';

// 1) 读取当前库里的自定义值（若有），渲染三种模板
console.log('code   :', JSON.stringify(await mailTemplate('code', { code: '123456' })));
console.log('welcome:', JSON.stringify(await mailTemplate('welcome', { name: '小光' })));
console.log('test   :', JSON.stringify(await mailTemplate('test')));
console.log('test(+site=自定义):', JSON.stringify(await mailTemplate('test', { site: '覆盖站点名' })));
await pool.end();
