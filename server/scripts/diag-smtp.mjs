/* 诊断：查看当前 SMTP 配置（密码打码） */
import { smtpConfig, getAllSettings } from '../src/services/settings.js';
const all = await getAllSettings();
const mask = (v) => (v ? `${String(v).slice(0, 2)}***${String(v).slice(-2)} (len=${String(v).length})` : '(空)');
console.log('smtp_host :', all.smtp_host ?? '(空)');
console.log('smtp_port :', all.smtp_port ?? '(空)');
console.log('smtp_secure:', JSON.stringify(all.smtp_secure) ?? '(空)');
console.log('smtp_user :', all.smtp_user ?? '(空)');
console.log('smtp_pass :', mask(all.smtp_pass));
console.log('smtp_from :', all.smtp_from ?? '(空)');
const c = await smtpConfig();
console.log('\n--> 生效配置:', c ? { host: c.host, port: c.port, secure: c.secure, user: c.user, from: c.from, passLen: c.pass?.length } : 'null（未配置）');
process.exit(0);
