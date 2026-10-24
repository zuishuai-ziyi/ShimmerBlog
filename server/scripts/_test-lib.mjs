/**
 * 测试脚本公共库（第 45 轮新增：注册需邮箱验证后，所有脚本建号都要先取验证码）
 *
 * 用法：
 *   import { registerUser, latestCode } from './_test-lib.mjs';
 *   const r = await registerUser('http://127.0.0.1:3010/api', { email, password, name });
 */
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';

/** 直查 DB 取最新验证码（SMTP 已配置时接口不返回 devCode，这是唯一稳定取码途径） */
export async function latestCode(email, purpose) {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
  });
  try {
    const sql = purpose
      ? 'SELECT code FROM email_codes WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1'
      : 'SELECT code FROM email_codes WHERE email = ? ORDER BY id DESC LIMIT 1';
    const [rows] = await conn.query(sql, purpose ? [email, purpose] : [email]);
    return rows[0]?.code;
  } finally {
    await conn.end();
  }
}

/**
 * 注册需邮箱验证：先请求注册验证码，再用验证码注册。
 * apiBase 形如 http://127.0.0.1:3010/api
 * 返回 { status, data }（status/data 来自 POST /auth/register）
 */
export async function registerUser(apiBase, { email, password, name }) {
  const send = await fetch(`${apiBase}/auth/send-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, purpose: 'register' }),
  });
  const sendData = await send.json().catch(() => ({}));
  const mail = String(email).toLowerCase();
  const code = sendData.devCode || (await latestCode(mail, 'register'));
  const r = await fetch(`${apiBase}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, code }),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
