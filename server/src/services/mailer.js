import nodemailer from 'nodemailer';
import { smtpConfig, mailTemplate } from './settings.js';

/** 组建 transport：后台 SMTP 配置优先（env 回退），未配置返回 null */
async function getTransporter() {
  const smtp = await smtpConfig();
  if (!smtp?.host) return null;
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    tls: { rejectUnauthorized: false },
  });
  return { transporter, from: smtp.from };
}

/** 发送验证码邮件（模板可在后台配置，{code} 占位）。SMTP 未配置时返回 false（开发模式打日志）。 */
export async function sendCodeEmail(email, code) {
  const t = await getTransporter();
  const tpl = await mailTemplate();
  const subject = tpl.subject.replaceAll('{code}', code);
  const text = tpl.body.replaceAll('{code}', code);
  if (!t) {
    console.log(`[mailer] SMTP 未配置（开发模式），验证码: ${email} -> ${code}`);
    return false;
  }
  await t.transporter.sendMail({ from: t.from, to: email, subject, text });
  return true;
}

/** 后台「发送测试邮件」：复用当前 SMTP 配置与模板；失败抛错给调用方展示 */
export async function sendTestEmail(email) {
  const t = await getTransporter();
  if (!t) throw new Error('SMTP 未配置：请先填写 SMTP 主机等配置并保存');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const tpl = await mailTemplate();
  await t.transporter.sendMail({
    from: t.from,
    to: email,
    subject: '[测试] ' + tpl.subject.replaceAll('{code}', code),
    text: tpl.body.replaceAll('{code}', code) + '\n\n（这是一封后台发送的测试邮件）',
  });
}
