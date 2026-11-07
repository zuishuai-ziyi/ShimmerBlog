import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { adminRequired } from '../middleware/auth.js';
import { signAdminToken, applyDefaultNameColor, makeLimiter } from '../utils.js';
import { getAllSettings, setSettings, githubConfig, googleConfig, smtpConfig, MAIL_TEMPLATES } from '../services/settings.js';
import {
  getAIConfig,
  normalizeFlow,
  retryAI,
  forceFinal,
  describeRecord,
  ReviewError,
  cancelPendingByArticle,
} from '../services/review.js';
import { runAIReview } from '../services/ai-review.js';
import { sendTestEmail } from '../services/mailer.js';
import { setReviewerNotifyPrefs, reviewerNotifyOf } from '../services/notify.js';
import { captchaGuard, captchaConfig } from '../services/captcha.js';
import { imageUpload } from '../uploads.js';

export const adminRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ADMIN_SELECT = 'id, email, name, name_color, bio, avatar_url, permissions, status, github_id, email_verified, created_at';
const PERMISSION_KEYS = ['post'];
const NAME_COLOR_RE = /^#?[0-9a-fA-F]{3,8}$/;

/** 审核员列表字段（不含密码） */
const REVIEWER_SELECT = 'id, username, display_name, email, status, created_at, last_login_at, notify_prefs';

/** 审核员对外信息：notify_prefs 解析成 notify 开关，不暴露原始字符串 */
function reviewerView(r) {
  if (!r) return null;
  const { notify_prefs, ...rest } = r;
  return { ...rest, notify: reviewerNotifyOf(notify_prefs) };
}

/** 统一的 400 响应体：前端 errMsg 读 error，审核页 revErr 读 message，两者都给 */
function badRequest(message) {
  const text = String(message);
  return { error: text, message: text };
}

/** ReviewError 按自带状态码返回，其余交给全局错误处理 */
function reviewFail(e, res, next) {
  if (e instanceof ReviewError) return res.status(e.status).json(badRequest(e.message));
  next(e);
}

/** AI 审核配置里的 api_key 不回传明文：非空 → '__KEEP__'，空 → '' */
function maskReviewAi(raw) {
  try {
    const obj = JSON.parse(String(raw ?? ''));
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return String(raw ?? '');
    obj.api_key = obj.api_key ? '__KEEP__' : '';
    return JSON.stringify(obj);
  } catch {
    return String(raw ?? '');
  }
}

/** 解析可能是 JSON 字符串或对象的配置字段 */
function parseJsonMaybe(raw) {
  if (raw && typeof raw === 'object') return raw;
  return JSON.parse(String(raw ?? ''));
}

/** review_records.stages 存的是 JSON 字符串，出参统一成数组（前端契约声明 string[]） */
function parseStages(raw) {
  if (Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(String(raw ?? ''));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/* ---------- 后台登录（独立密码，与用户体系分离） ---------- */
const adminLoginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyOf: (req) => `admin-login:${req.ip}`,
  message: '尝试过于频繁，请 15 分钟后再试',
});

async function adminPasswordHash() {
  const [rows] = await pool.query("SELECT value FROM settings WHERE `key` = 'admin_password_hash' LIMIT 1");
  return rows[0]?.value ?? '';
}

adminRouter.post('/login', adminLoginLimiter, captchaGuard, async (req, res, next) => {
  try {
    const password = String(req.body?.password ?? '');
    const hash = await adminPasswordHash();
    if (!hash || !(await bcrypt.compare(password, hash))) {
      return res.status(401).json({ error: '管理密码错误' });
    }
    res.json({ token: signAdminToken(), expiresInHours: 12 });
  } catch (e) {
    next(e);
  }
});

adminRouter.get('/session', adminRequired, (_req, res) => {
  res.json({ ok: true });
});

adminRouter.put('/password', adminRequired, async (req, res, next) => {
  try {
    const password = String(req.body?.password ?? '');
    if (password.length < 6) return res.status(400).json({ error: '管理密码至少 6 位' });
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO settings (`key`, value) VALUES ('admin_password_hash', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      [hash]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ---------- 用户管理 ---------- */
adminRouter.get('/users', adminRequired, async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
    const where = q ? 'WHERE email LIKE ? OR name LIKE ?' : '';
    const args = q ? [`%${q}%`, `%${q}%`] : [];
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM users ${where}`, args);
    const [rows] = await pool.query(
      `SELECT ${ADMIN_SELECT} FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...args, pageSize, (page - 1) * pageSize]
    );
    const [stat] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM articles) AS articles,
         (SELECT COUNT(*) FROM articles WHERE status = 'published') AS published,
         (SELECT COUNT(*) FROM articles WHERE status = 'draft') AS drafts`
    );
    res.json({ items: rows, total, page, pageSize, stats: stat[0] });
  } catch (e) {
    next(e);
  }
});

adminRouter.patch('/users/:id', adminRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    if (!rows[0]) return res.status(404).json({ error: '用户不存在' });

    const sets = [];
    const args = [];
    if (req.body?.status === 'active' || req.body?.status === 'disabled') {
      sets.push('status = ?');
      args.push(req.body.status);
    }
    if (req.body?.name !== undefined) {
      const n = String(req.body.name ?? '').trim();
      if (!n) return res.status(400).json({ error: '昵称不能为空' });
      sets.push('name = ?');
      args.push(n.slice(0, 50));
    }
    if (req.body?.email !== undefined) {
      const mail = String(req.body.email ?? '').trim().toLowerCase();
      if (!EMAIL_RE.test(mail)) return res.status(400).json({ error: '邮箱格式不正确' });
      const [dup] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [mail, id]);
      if (dup[0]) return res.status(409).json({ error: '该邮箱已被其他用户使用' });
      sets.push('email = ?', 'email_verified = 0'); // 新邮箱需重新验证（验证码登录可重新验证）
      args.push(mail);
    }
    if (req.body?.password !== undefined) {
      const pwd = String(req.body.password ?? '');
      if (pwd.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
      sets.push('password_hash = ?');
      args.push(bcrypt.hashSync(pwd, 10));
    }
    if (req.body?.name_color !== undefined) {
      const c = String(req.body.name_color ?? '').trim();
      if (c && !NAME_COLOR_RE.test(c)) return res.status(400).json({ error: '颜色格式不正确' });
      sets.push('name_color = ?');
      args.push(c ? (c.startsWith('#') ? c : `#${c}`) : null);
    }
    if (req.body?.bio !== undefined) {
      sets.push('bio = ?');
      args.push(String(req.body.bio ?? '').slice(0, 500) || null);
    }
    if (req.body?.permissions !== undefined) {
      if (req.body.permissions === null) {
        sets.push('permissions = NULL'); // 恢复默认权限
      } else if (Array.isArray(req.body.permissions)) {
        const perms = req.body.permissions.filter((p) => PERMISSION_KEYS.includes(p));
        sets.push('permissions = ?');
        args.push(JSON.stringify(perms));
      } else {
        return res.status(400).json({ error: 'permissions 需为数组或 null' });
      }
    }
    if (!sets.length) return res.status(400).json({ error: '没有可修改的字段' });
    args.push(id);
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, args);
    const [after] = await pool.query(`SELECT ${ADMIN_SELECT} FROM users WHERE id = ?`, [id]);
    res.json({ user: after[0] });
  } catch (e) {
    next(e);
  }
});

/** 删除用户：彻底删除（文章经 fk_articles_author ON DELETE CASCADE 级联删除） */
adminRouter.delete('/users/:id', adminRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query('SELECT id FROM users WHERE id = ? LIMIT 1', [id]);
    if (!rows[0]) return res.status(404).json({ error: '用户不存在' });
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ---------- 站点配置（站点信息 / 关于页 / 邮件模板 / SMTP） ---------- */
adminRouter.get('/settings', adminRequired, async (_req, res, next) => {
  try {
    const all = await getAllSettings();
    const gh = await githubConfig();
    const gg = await googleConfig();
    const smtp = await smtpConfig();
    res.json({
      settings: {
        ...all,
        // 密钥不回传明文，只回传是否已配置
        github_client_secret: all.github_client_secret ? '__KEEP__' : '',
        google_client_secret: all.google_client_secret ? '__KEEP__' : '',
        smtp_pass: all.smtp_pass ? '__KEEP__' : '',
        recaptcha_secret_key: all.recaptcha_secret_key ? '__KEEP__' : '',
        // AI 审核配置是 JSON 字符串，掩码后回写
        review_ai: maskReviewAi(all.review_ai),
      },
      // 邮件模板元数据：前端据此渲染每种邮件的编辑器（含占位符提示与内置默认值）
      mailTemplates: Object.values(MAIL_TEMPLATES).map((t) => ({
        kind: t.kind,
        label: t.label,
        desc: t.desc,
        placeholders: t.placeholders,
        subjectKey: t.subjectKey,
        bodyKey: t.bodyKey,
        defaultSubject: t.defaults.subject,
        defaultBody: t.defaults.body,
      })),
      githubEnabled: gh.enabled,
      googleEnabled: gg.enabled,
      smtpEnabled: !!smtp,
    });
  } catch (e) {
    next(e);
  }
});

adminRouter.put('/settings', adminRequired, async (req, res, next) => {
  try {
    const body = { ...(req.body ?? {}) };
    /* ---- 审核流程配置：JSON.parse + normalizeFlow，归一化后存回 ---- */
    if (body.review_flow !== undefined) {
      let rawFlow;
      try {
        rawFlow = parseJsonMaybe(body.review_flow);
      } catch (e) {
        return res.status(400).json(badRequest(`审核流程配置无效: JSON 解析失败（${String(e?.message || e)}）`));
      }
      let flow;
      try {
        flow = normalizeFlow(rawFlow);
      } catch (e) {
        const msg = String(e?.message || e);
        return res.status(400).json(badRequest(msg.includes('审核流程配置无效') ? msg : `审核流程配置无效: ${msg}`));
      }
      body.review_flow = JSON.stringify(flow);
    }
    /* ---- AI 审核配置：逐项校验 + api_key 语义（''=保留 / __CLEAR__=清空 / 其他=新值） ---- */
    if (body.review_ai !== undefined) {
      let rawAi;
      try {
        rawAi = parseJsonMaybe(body.review_ai);
      } catch (e) {
        return res.status(400).json(badRequest(`AI 审核配置无效: JSON 解析失败（${String(e?.message || e)}）`));
      }
      if (!rawAi || typeof rawAi !== 'object' || Array.isArray(rawAi)) {
        return res.status(400).json(badRequest('AI 审核配置无效: 需要 JSON 对象'));
      }
      const cur = await getAIConfig();
      const base_url = rawAi.base_url !== undefined ? String(rawAi.base_url ?? '').trim() : cur.base_url;
      if (base_url && !/^https?:\/\//i.test(base_url)) {
        return res.status(400).json(badRequest('AI 审核配置无效: 接口地址必须以 http(s):// 开头'));
      }
      const model = rawAi.model !== undefined ? String(rawAi.model ?? '').trim() : cur.model;
      if (model.length > 100) {
        return res.status(400).json(badRequest('AI 审核配置无效: 模型名最长 100 字'));
      }
      const thinking = rawAi.thinking !== undefined ? String(rawAi.thinking ?? 'off') : cur.thinking;
      if (!['off', 'low', 'medium', 'high'].includes(thinking)) {
        return res.status(400).json(badRequest('AI 审核配置无效: thinking 仅支持 off / low / medium / high'));
      }
      const temperature = rawAi.temperature !== undefined ? Number(rawAi.temperature) : cur.temperature;
      if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
        return res.status(400).json(badRequest('AI 审核配置无效: temperature 需为 0-2 之间的数值'));
      }
      const timeout_seconds = rawAi.timeout_seconds !== undefined ? Number(rawAi.timeout_seconds) : cur.timeout_seconds;
      if (!Number.isInteger(timeout_seconds) || timeout_seconds < 5 || timeout_seconds > 300) {
        return res.status(400).json(badRequest('AI 审核配置无效: timeout_seconds 需为 5-300 之间的整数'));
      }
      const strictness = rawAi.strictness !== undefined ? String(rawAi.strictness ?? 'standard') : cur.strictness;
      if (!['loose', 'standard', 'strict', 'custom'].includes(strictness)) {
        return res.status(400).json(badRequest('AI 审核配置无效: strictness 仅支持 loose / standard / strict / custom'));
      }
      const custom_prompt = rawAi.custom_prompt !== undefined ? String(rawAi.custom_prompt ?? '') : cur.custom_prompt;
      if (custom_prompt.length > 5000) {
        return res.status(400).json(badRequest('AI 审核配置无效: 自定义提示词最长 5000 字'));
      }
      let api_key = cur.api_key;
      if (rawAi.api_key !== undefined) {
        const k = String(rawAi.api_key ?? '');
        if (k === '' || k === '__KEEP__') api_key = cur.api_key; // 保留原值（GET 回传的就是 '__KEEP__'）
        else if (k === '__CLEAR__') api_key = ''; // 清空
        else {
          if (k.length > 200) return res.status(400).json(badRequest('AI 审核配置无效: API Key 最长 200 字'));
          api_key = k; // 新值
        }
      }
      body.review_ai = JSON.stringify({
        base_url,
        api_key,
        model,
        thinking,
        temperature,
        timeout_seconds,
        strictness,
        custom_prompt,
      });
    }
    // 密钥：'__KEEP__' 与空串都表示「不修改」，'__CLEAR__' 才是清空
    for (const key of ['github_client_secret', 'google_client_secret', 'smtp_pass', 'recaptcha_secret_key']) {
      if (body[key] === '__KEEP__' || body[key] === '') delete body[key];
      else if (body[key] === '__CLEAR__') body[key] = '';
    }
    // 非密文本字段（SMTP 主机/端口/用户/发件人）：'__CLEAR__' 同样视为清空，
    // 防止哨兵串被当成真实值存库（曾导致 smtp_host='__CLEAR__' 连不上）
    for (const key of ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_from']) {
      if (body[key] === '__CLEAR__') body[key] = '';
    }
    // 布尔开关统一存 '1' / '0'
    if (typeof body.register_open === 'boolean') body.register_open = body.register_open ? '1' : '0';
    if (typeof body.smtp_secure === 'boolean') body.smtp_secure = body.smtp_secure ? '1' : '0';
    if (typeof body.captcha_enabled === 'boolean') body.captcha_enabled = body.captcha_enabled ? '1' : '0';
    // 行为验证码：api/verify_api 必须是 http(s) 地址或空；id 非空串
    for (const key of ['captcha_api', 'captcha_verify_api', 'recaptcha_verify_api']) {
      if (body[key] !== undefined) {
        const u = String(body[key] ?? '').trim().replace(/\/+$/, '');
        if (u && !/^https?:\/\//.test(u)) return res.status(400).json({ error: '验证码服务地址必须以 http(s):// 开头' });
        body[key] = u;
      }
    }
    // 验证服务类型：gocaptcha（点选）/ tianai（天爱滑块）/ recaptcha（v2 勾选框）
    if (body.captcha_provider !== undefined) {
      const p = String(body.captcha_provider ?? '').trim();
      if (!['gocaptcha', 'tianai', 'recaptcha'].includes(p)) return res.status(400).json({ error: '验证码类型仅支持 gocaptcha、tianai 或 recaptcha' });
      body.captcha_provider = p;
    }
    if (body.recaptcha_site_key !== undefined) {
      body.recaptcha_site_key = String(body.recaptcha_site_key ?? '').trim();
    }
    if (body.captcha_id !== undefined) {
      const cid = String(body.captcha_id ?? '').trim();
      if (!cid) return res.status(400).json({ error: '验证码实例 ID 不能为空' });
      body.captcha_id = cid;
    }
    // 默认用户名颜色：格式校验（空 = 恢复内置默认）
    if (body.default_name_color !== undefined) {
      const c = String(body.default_name_color ?? '').trim();
      if (c && !NAME_COLOR_RE.test(c)) return res.status(400).json({ error: '颜色格式不正确' });
      body.default_name_color = c ? (c.startsWith('#') ? c : `#${c}`) : '';
    }
    // 第三方头像下载限制：整数 + 范围鍳制（跳数 0–12，超时 1–300 秒）
    for (const [key, min, max] of [
      ['avatar_redirect_hops', 0, 12],
      ['avatar_timeout_seconds', 1, 300],
    ]) {
      if (body[key] !== undefined) {
        const n = parseInt(body[key], 10);
        if (!Number.isFinite(n)) return res.status(400).json({ error: '头像下载参数必须为整数' });
        body[key] = String(Math.min(max, Math.max(min, n)));
      }
    }
    const r = await setSettings(body);
    const gh = await githubConfig();
    const gg = await googleConfig();
    const smtp = await smtpConfig();
    const cap = await captchaConfig();
    res.json({ ok: true, updated: r.updated, githubEnabled: gh.enabled, googleEnabled: gg.enabled, smtpEnabled: !!smtp, captchaEnabled: cap.enabled });
  } catch (e) {
    next(e);
  }
});

/* ---------- 站点 Logo 上传 ---------- */
adminRouter.post('/logo', adminRequired, (req, res) => {
  imageUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Logo 上传失败' });
    if (!req.file) return res.status(400).json({ error: '未收到图片文件' });
    const url = `/uploads/images/${req.file.filename}`;
    await setSettings({ site_logo_url: url });
    res.json({ url });
  });
});

adminRouter.delete('/logo', adminRequired, async (_req, res, next) => {
  try {
    await setSettings({ site_logo_url: '' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ---------- 用户默认头像上传 ---------- */
adminRouter.post('/default-avatar', adminRequired, (req, res) => {
  imageUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || '默认头像上传失败' });
    if (!req.file) return res.status(400).json({ error: '未收到图片文件' });
    const url = `/uploads/images/${req.file.filename}`;
    await setSettings({ default_avatar_url: url });
    res.json({ url });
  });
});

adminRouter.delete('/default-avatar', adminRequired, async (_req, res, next) => {
  try {
    await setSettings({ default_avatar_url: '' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ---------- 发送测试邮件 ---------- */
adminRouter.post('/mail/test', adminRequired, async (req, res, next) => {
  try {
    const to = String(req.body?.to ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: '邮箱格式不正确' });
    await sendTestEmail(to);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || '发送失败' });
  }
});

/* ---------- 文章管理（全量，含草稿） ---------- */
adminRouter.get('/articles', adminRequired, async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
    const where = q ? 'WHERE a.title LIKE ?' : '';
    const args = q ? [`%${q}%`] : [];
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM articles a ${where}`, args);
    const [rows] = await pool.query(
      `SELECT a.id, a.title, a.summary, a.status, a.review_state, a.pinned, a.published_at, a.created_at, a.updated_at,
              a.author_id, u.name AS author_name, u.name_color AS author_name_color
       FROM articles a JOIN users u ON a.author_id = u.id ${where}
       ORDER BY a.updated_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [...args, pageSize, (page - 1) * pageSize]
    );
    await applyDefaultNameColor(rows);
    res.json({ items: rows, total, page, pageSize });
  } catch (e) {
    next(e);
  }
});

/* ---------- 文章管理：删除 / 置顶（后台令牌即可，不经用户鉴权） ---------- */
adminRouter.patch('/articles/:id', adminRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const pinned = req.body?.pinned === true || req.body?.pinned === 1 ? 1 : 0;
    const [r] = await pool.query('UPDATE articles SET pinned = ? WHERE id = ?', [pinned, id]);
    if (!r.affectedRows) return res.status(404).json({ error: '文章不存在' });
    res.json({ ok: true, pinned });
  } catch (e) {
    next(e);
  }
});

adminRouter.delete('/articles/:id', adminRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    // 删除前作废该文章下的待审记录，避免队列里留下指向已删文章的僵尸条目
    await cancelPendingByArticle(id, 'admin').catch((e) => {
      console.error('[review] 取消待审记录失败:', String(e?.message || e));
    });
    const [r] = await pool.query('DELETE FROM articles WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ error: '文章不存在' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ---------- 审核员管理（独立账号体系） ---------- */
adminRouter.get('/reviewers', adminRequired, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT ${REVIEWER_SELECT} FROM reviewers ORDER BY id DESC`);
    res.json({ reviewers: rows.map(reviewerView) });
  } catch (e) {
    next(e);
  }
});

adminRouter.post('/reviewers', adminRequired, async (req, res, next) => {
  try {
    const username = String(req.body?.username ?? '').trim();
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json(badRequest('用户名长度需在 3-50 字之间'));
    }
    const password = String(req.body?.password ?? '');
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json(badRequest('密码长度需在 8-72 位之间'));
    }
    const displayName = String(req.body?.display_name ?? '').trim().slice(0, 100);
    // 邮箱（可选）：用于接收审核通知邮件，校验规则与 PUT /admin/reviewers/:id 一致
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (email && !EMAIL_RE.test(email)) return res.status(400).json(badRequest('邮箱格式不正确'));
    if (email.length > 255) return res.status(400).json(badRequest('邮箱最长 255 字'));
    const [dup] = await pool.query('SELECT id FROM reviewers WHERE username = ? LIMIT 1', [username]);
    if (dup[0]) return res.status(409).json(badRequest('用户名已存在'));
    const hash = await bcrypt.hash(password, 10);
    let insertedId = null;
    try {
      const [r] = await pool.query(
        'INSERT INTO reviewers (username, password_hash, display_name, email) VALUES (?, ?, ?, ?)',
        [username, hash, displayName, email || null]
      );
      insertedId = r.insertId;
    } catch (e) {
      // 并发同名注册：唯一索引兜底，返回 409 而不是 500
      if (e?.code === 'ER_DUP_ENTRY') return res.status(409).json(badRequest('用户名已存在'));
      throw e;
    }
    const [rows] = await pool.query(`SELECT ${REVIEWER_SELECT} FROM reviewers WHERE id = ?`, [insertedId]);
    res.status(201).json({ reviewer: reviewerView(rows[0]) });
  } catch (e) {
    next(e);
  }
});

adminRouter.put('/reviewers/:id', adminRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query('SELECT id FROM reviewers WHERE id = ? LIMIT 1', [id]);
    if (!rows[0]) return res.status(404).json(badRequest('审核员不存在'));
    const sets = [];
    const args = [];
    if (req.body?.display_name !== undefined) {
      const dn = String(req.body.display_name ?? '').trim();
      if (dn.length > 100) return res.status(400).json(badRequest('显示名最长 100 字'));
      sets.push('display_name = ?');
      args.push(dn);
    }
    if (req.body?.status !== undefined) {
      const st = String(req.body.status);
      if (!['active', 'disabled'].includes(st)) return res.status(400).json(badRequest('审核员状态无效'));
      sets.push('status = ?');
      args.push(st);
    }
    if (req.body?.email !== undefined) {
      const em = String(req.body.email ?? '').trim().toLowerCase();
      if (em && !EMAIL_RE.test(em)) return res.status(400).json(badRequest('邮箱格式不正确'));
      if (em.length > 255) return res.status(400).json(badRequest('邮箱最长 255 字'));
      sets.push('email = ?');
      args.push(em || null);
    }
    if (req.body?.password !== undefined) {
      const pw = String(req.body.password ?? '');
      if (pw.length < 8 || pw.length > 72) return res.status(400).json(badRequest('密码长度需在 8-72 位之间'));
      sets.push('password_hash = ?');
      args.push(await bcrypt.hash(pw, 10));
    }
    // 通知开关：new_task（可选，管理员代设）
    const hasNotify = req.body?.notify_new_task !== undefined;
    if (hasNotify && typeof req.body.notify_new_task !== 'boolean') {
      return res.status(400).json(badRequest('notify_new_task 必须是布尔值'));
    }
    if (!sets.length && !hasNotify) return res.status(400).json(badRequest('没有可修改的字段'));
    if (sets.length) {
      args.push(id);
      await pool.query(`UPDATE reviewers SET ${sets.join(', ')} WHERE id = ?`, args);
    }
    if (hasNotify) await setReviewerNotifyPrefs(id, { new_task: req.body.notify_new_task });
    const [after] = await pool.query(`SELECT ${REVIEWER_SELECT} FROM reviewers WHERE id = ?`, [id]);
    res.json({ reviewer: reviewerView(after[0]) });
  } catch (e) {
    next(e);
  }
});

adminRouter.delete('/reviewers/:id', adminRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [r] = await pool.query('DELETE FROM reviewers WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json(badRequest('审核员不存在'));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ---------- 审核记录（后台全量视图） ---------- */
adminRouter.get('/review/records', adminRequired, async (req, res, next) => {
  try {
    const status = String(req.query.status ?? 'all');
    const stage = String(req.query.stage ?? 'all');
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
    const where = [];
    const args = [];
    if (['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
      where.push('rr.status = ?');
      args.push(status);
    }
    if (['ai', 'human'].includes(stage)) {
      where.push('rr.stage = ?');
      args.push(stage);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM review_records rr
       LEFT JOIN users u ON u.id = rr.author_id
       LEFT JOIN articles a ON a.id = rr.article_id
       ${whereSql}`,
      args
    );
    // 显式列白名单：避免 rr.* 把 MEDIUMTEXT 正文和 ai_raw 整块拉出来（一页 100 条时包体巨大）
    // 正文只给摘要，正文全文由 /api/review/records/:id 单条详情接口提供
    const [rows] = await pool.query(
      `SELECT rr.id, rr.article_id, rr.author_id, rr.title, rr.summary,
              LEFT(rr.content, 200) AS content, rr.status, rr.stages, rr.stage_index, rr.stage,
              rr.ai_verdict, rr.ai_reason, rr.ai_model, NULL AS ai_raw, rr.ai_error,
              rr.reviewer_id, rr.reject_note, rr.decided_at, rr.created_at,
              a.status AS article_status, u.name AS author_name
       FROM review_records rr
       LEFT JOIN users u ON u.id = rr.author_id
       LEFT JOIN articles a ON a.id = rr.article_id
       ${whereSql}
       ORDER BY rr.id DESC
       LIMIT ? OFFSET ?`,
      [...args, pageSize, (page - 1) * pageSize]
    );
    // 步骤信息（进度条用）：与其它接口同一套 describeRecord；不改动列白名单与正文截断
    res.json({
      items: rows.map((r) => {
        const d = describeRecord(r);
        return {
          ...r,
          stages: parseStages(r.stages),
          steps: d.steps,
          current_stage: d.current_stage,
          current_stage_label: d.current_stage_label,
        };
      }),
      total,
      page,
      pageSize,
    });
  } catch (e) {
    next(e);
  }
});

/* ---------- 重试失败的 AI 初审 ---------- */
adminRouter.post('/review/records/:id/retry-ai', adminRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const record = await retryAI(id, 'admin');
    res.json({ record });
  } catch (e) {
    reviewFail(e, res, next);
  }
});

/* ---------- 管理员强制终审（通过 / 拒绝） ---------- */
adminRouter.post('/review/records/:id/final', adminRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const action = String(req.body?.action ?? '').trim().toLowerCase();
    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json(badRequest('审核操作无效'));
    }
    const note = req.body?.note === undefined || req.body?.note === null ? '' : String(req.body.note);
    if (note.length > 500) return res.status(400).json(badRequest('备注最长 500 字'));
    const record = await forceFinal({ recordId: id, action, note, actorName: 'admin' });
    res.json({ record });
  } catch (e) {
    reviewFail(e, res, next);
  }
});

/* ---------- AI 审核连通性测试 ---------- */
adminRouter.post('/review/ai-test', adminRequired, async (req, res, next) => {
  try {
    const title = String(req.body?.title ?? '').trim();
    const content = String(req.body?.content ?? '');
    if (title.length > 200) return res.status(400).json(badRequest('标题最长 200 字'));
    if (content.length < 1 || content.length > 50000) {
      return res.status(400).json(badRequest('正文长度需在 1-50000 字之间'));
    }
    const cfg = await getAIConfig();
    if (!cfg.api_key || !cfg.base_url || !cfg.model) {
      return res.status(400).json(badRequest('AI 审核未配置：请先填写接口地址、密钥与模型'));
    }
    try {
      const result = await runAIReview(cfg, { title, summary: '', content });
      res.json({
        verdict: result.verdict,
        reason: result.reason,
        confidence: result.confidence,
        model: cfg.model,
      });
    } catch (e) {
      return res.status(400).json(badRequest(`AI 调用失败：${String(e?.message || e)}`));
    }
  } catch (e) {
    next(e);
  }
});
