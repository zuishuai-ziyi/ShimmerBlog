/* 诊断：用项目自身 mailer 实发一封测试邮件，打印完整 SMTP 错误 */
import { sendTestEmail } from '../src/services/mailer.js';
const to = process.argv[2] || 'noreply@email.xiaoziyi.com';
try {
  await sendTestEmail(to);
  console.log(`发送成功 -> ${to}`);
} catch (e) {
  console.error('发送失败:', e.message);
  if (e.response) console.error('SMTP 响应:', e.response);
  if (e.code) console.error('code:', e.code);
  process.exit(1);
}
process.exit(0);
