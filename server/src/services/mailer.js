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
  const tpl = await mailTemplate('code', { code });
  if (!t) {
    console.log(`[mailer] SMTP 未配置（开发模式），验证码: ${email} -> ${code}`);
    return false;
  }
  await t.transporter.sendMail({ from: t.from, to: email, subject: tpl.subject, text: tpl.body });
  return true;
}

/**
 * 发送欢迎邮件（新用户注册成功后调用）。
 * 失败不抛错——欢迎邮件绝不阻塞注册流程，只记日志。
 */
export async function sendWelcomeEmail(user) {
  try {
    if (!user?.email) return false;
    const t = await getTransporter();
    const tpl = await mailTemplate('welcome', { name: user.name || '', email: user.email });
    if (!t) {
      console.log(`[mailer] SMTP 未配置（开发模式），跳过欢迎邮件: ${user.email}`);
      return false;
    }
    await t.transporter.sendMail({ from: t.from, to: user.email, subject: tpl.subject, text: tpl.body });
    return true;
  } catch (e) {
    console.warn(`[mailer] 欢迎邮件发送失败（不影响注册）: ${user?.email} ->`, e.message);
    return false;
  }
}

/** 后台「发送测试邮件」：使用测试模板；失败抛错给调用方展示 */
export async function sendTestEmail(email) {
  const t = await getTransporter();
  if (!t) throw new Error('SMTP 未配置：请先填写 SMTP 主机等配置并保存');
  const tpl = await mailTemplate('test');
  const stamp = new Date().toLocaleString('zh-CN');
  await t.transporter.sendMail({
    from: t.from,
    to: email,
    subject: tpl.subject,
    text: `${tpl.body}\n\n（后台发送的测试邮件 · ${stamp}）`,
  });
}

/**
 * 发送通知类邮件（登录提醒 / 审核状态 / 审核员新任务）。
 * 模板 kind 见 settings.js 的 MAIL_TEMPLATES（notify_* 系列）。
 * SMTP 未配置 → 返回 false；发送异常 → 记一行日志后返回 false（永不抛错，绝不阻塞主流程）。
 */
export async function sendNotifyEmail(to, kind, vars = {}) {
  try {
    const target = String(to ?? '').trim();
    if (!target) return false;
    const t = await getTransporter();
    if (!t) {
      console.log(`[mailer] SMTP 未配置（开发模式），跳过通知邮件: ${kind} -> ${target}`);
      return false;
    }
    const tpl = await mailTemplate(kind, vars);
    await t.transporter.sendMail({
      from: t.from,
      to: target,
      subject: tpl.subject,
      text: tpl.body,
    });
    return true;
  } catch (e) {
    console.warn(`[mailer] 通知邮件发送失败（不影响主流程）: ${kind} -> ${to} ->`, e?.message || e);
    return false;
  }
}
