import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter = null;

function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      tls: { rejectUnauthorized: false },
    });
  }
  return transporter;
}

/** 发送验证码邮件。SMTP 未配置时返回 false 并把验证码打到日志（开发模式）。 */
export async function sendCodeEmail(email, code) {
  const t = getTransporter();
  const subject = '微光博客 · 登录验证码';
  const text = `你的验证码是 ${code}，10 分钟内有效。若非本人操作请忽略本邮件。`;
  if (!t) {
    console.log(`[mailer] SMTP 未配置（开发模式），验证码: ${email} -> ${code}`);
    return false;
  }
  await t.sendMail({ from: config.smtp.from || config.smtp.user, to: email, subject, text });
  return true;
}
