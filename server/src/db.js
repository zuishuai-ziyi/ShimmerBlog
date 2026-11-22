import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4_unicode_ci',
});

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  name VARCHAR(50) NOT NULL,
  avatar_url VARCHAR(500) NULL,
  name_color VARCHAR(20) NULL,
  bio VARCHAR(500) NULL,
  permissions JSON NULL,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  github_id BIGINT UNSIGNED NULL UNIQUE,
  google_id VARCHAR(255) NULL UNIQUE,
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS articles (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  author_id BIGINT NOT NULL,
  title VARCHAR(200) NOT NULL,
  summary VARCHAR(500) NOT NULL DEFAULT '',
  content MEDIUMTEXT NOT NULL,
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  pinned TINYINT(1) NOT NULL DEFAULT 0,
  published_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status_pub (status, published_at),
  INDEX idx_author (author_id),
  CONSTRAINT fk_articles_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_codes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(6) NOT NULL,
  purpose ENUM('login','register','bind','reset','change-password') NOT NULL DEFAULT 'login',
  expires_at DATETIME NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_purpose (email, purpose)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  \`key\` VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 审核员账号（独立体系，不走 users 表）
CREATE TABLE IF NOT EXISTS reviewers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL DEFAULT '',
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 文章审核记录（提交时对标题/摘要/正文做快照，终审通过才写回 articles）
CREATE TABLE IF NOT EXISTS review_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  article_id BIGINT NOT NULL,
  author_id BIGINT NOT NULL,
  title VARCHAR(200) NOT NULL,
  summary VARCHAR(500) NOT NULL DEFAULT '',
  content MEDIUMTEXT NOT NULL,
  status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  stages VARCHAR(100) NOT NULL,
  stage_index TINYINT NOT NULL DEFAULT 0,
  stage ENUM('ai','human','done') NOT NULL DEFAULT 'ai',
  ai_verdict ENUM('approve','reject') NULL,
  ai_reason TEXT NULL,
  ai_model VARCHAR(100) NULL,
  ai_raw JSON NULL,
  ai_error VARCHAR(500) NULL,
  reviewer_id BIGINT NULL,
  reject_note VARCHAR(500) NULL,
  decided_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rr_status_stage (status, stage),
  INDEX idx_rr_article (article_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 审核流水（谁在什么时候做了什么）
CREATE TABLE IF NOT EXISTS review_actions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  record_id BIGINT NOT NULL,
  actor_type ENUM('author','ai','reviewer','admin','system') NOT NULL,
  actor_name VARCHAR(100) NOT NULL DEFAULT '',
  action VARCHAR(30) NOT NULL,
  note VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ra_record (record_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SSO provider：第三方登录提供方配置（github / google / generic）
CREATE TABLE IF NOT EXISTS oauth_providers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  type ENUM('github','google','generic') NOT NULL DEFAULT 'generic',
  client_id VARCHAR(255) NOT NULL DEFAULT '',
  client_secret VARCHAR(512) NOT NULL DEFAULT '',
  authorize_url VARCHAR(500) NOT NULL DEFAULT '',
  token_url VARCHAR(500) NOT NULL DEFAULT '',
  userinfo_url VARCHAR(500) NOT NULL DEFAULT '',
  scope VARCHAR(200) NOT NULL DEFAULT '',
  icon VARCHAR(50) NOT NULL DEFAULT '',
  icon_url VARCHAR(500) NOT NULL DEFAULT '',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户与第三方账号绑定（provider_user_id 统一按字符串存，github 是数字 ID，google 是 sub）
CREATE TABLE IF NOT EXISTS user_oauth_accounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  provider_slug VARCHAR(50) NOT NULL,
  provider_user_id VARCHAR(191) NOT NULL,
  avatar_url VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_uid (provider_slug, provider_user_id),
  KEY idx_user_provider (user_id, provider_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

/** 已存在的老库补列（CREATE TABLE IF NOT EXISTS 不会迁移已有表） */
async function ensureColumn(table, column, ddl) {
  const [cols] = await pool.query(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]
  );
  if (cols.length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
    console.log(`[db] 已为 ${table} 补充列 ${column}`);
  }
}

/**
 * SSO provider 迁移（一次性）：
 * 1. 旧 settings 表 / 环境变量里的 github/google 配置 → oauth_providers（仅在该 slug 还没有行时插入）；
 * 2. users 表里已有的第三方账号 ID → user_oauth_accounts（INSERT IGNORE，重复执行无副作用）。
 * 注意：这里直接查 settings 原始行，不经过 settings.js 的 DEFAULTS 合并。
 *
 * 迁移只跑一次：settings 表里写入标记键 oauth_providers_migrated，存在标记就整体跳过。
 * 否则管理员在后台删掉某个登录方式后，重启会被旧 settings 行 / 环境变量里的旧配置「复活」。
 * 另外只要 oauth_providers 表被用过（已有行或自增号已推进，说明管理员已在后台接管登录方式），
 * 旧配置一律不再导入。
 */
const OAUTH_MIGRATION_MARKER = 'oauth_providers_migrated';

async function migrateOAuthProviders() {
  // 一次性迁移：已打过标记的库直接整体跳过（旧配置不再有任何机会复活登录方式）
  const [markerRows] = await pool.query('SELECT value FROM settings WHERE `key` = ? LIMIT 1', [OAUTH_MIGRATION_MARKER]);
  if (markerRows.length > 0) return;

  const [rows] = await pool.query(
    "SELECT `key`, value FROM settings WHERE `key` IN ('github_client_id','github_client_secret','google_client_id','google_client_secret')"
  );
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value ?? '']));
  const legacy = [
    {
      slug: 'github',
      name: 'GitHub',
      type: 'github',
      sortOrder: 0,
      clientId: raw.github_client_id || config.github.clientId || '',
      clientSecret: raw.github_client_secret || config.github.clientSecret || '',
    },
    {
      slug: 'google',
      name: 'Google',
      type: 'google',
      sortOrder: 1,
      clientId: raw.google_client_id || config.google.clientId || '',
      clientSecret: raw.google_client_secret || config.google.clientSecret || '',
    },
  ];
  // oauth_providers 表被用过的判定：已有行，或自增号已推进（说明表里曾经插过行、后来被删）
  const [provCount] = await pool.query('SELECT COUNT(*) AS n FROM oauth_providers');
  const [provTable] = await pool.query(
    "SELECT AUTO_INCREMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'oauth_providers'"
  );
  const providersInUse = Number(provCount[0]?.n || 0) > 0 || Number(provTable[0]?.AUTO_INCREMENT || 1) > 1;
  if (providersInUse) {
    console.log('[db] oauth_providers 已有登录方式记录，跳过旧 SSO 配置导入');
  }
  for (const p of providersInUse ? [] : legacy) {
    // 没有任何 client_id 就先不建行（管理员可在后台自行创建 provider）
    if (!p.clientId) continue;
    const [exist] = await pool.query('SELECT id FROM oauth_providers WHERE slug = ? LIMIT 1', [p.slug]);
    if (exist.length > 0) continue;
    // 只有 client_id + client_secret 都齐了才启用；URL / scope 留空，运行时按 type 取内置预设
    const enabled = p.clientId && p.clientSecret ? 1 : 0;
    await pool.query(
      'INSERT INTO oauth_providers (slug, name, type, client_id, client_secret, authorize_url, token_url, userinfo_url, scope, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [p.slug, p.name, p.type, p.clientId, p.clientSecret, '', '', '', '', enabled, p.sortOrder]
    );
    console.log(`[db] 已迁移 ${p.name} 登录配置到 oauth_providers（enabled=${enabled}）`);
  }
  // 已有第三方账号的用户回填绑定关系（provider_user_id 统一存字符串；只回填实际存在的 provider）
  const [existSlugs] = await pool.query("SELECT slug FROM oauth_providers WHERE slug IN ('github','google')");
  const existSet = new Set(existSlugs.map((r) => r.slug));
  if (existSet.has('github')) {
    await pool.query(
      "INSERT IGNORE INTO user_oauth_accounts (user_id, provider_slug, provider_user_id) SELECT id, 'github', CAST(github_id AS CHAR) FROM users WHERE github_id IS NOT NULL"
    );
  }
  if (existSet.has('google')) {
    await pool.query(
      "INSERT IGNORE INTO user_oauth_accounts (user_id, provider_slug, provider_user_id) SELECT id, 'google', google_id FROM users WHERE google_id IS NOT NULL AND google_id <> ''"
    );
  }
  // 打标记：本次迁移到此结束，之后重启不再执行（ON DUPLICATE KEY UPDATE 保证幂等）
  await pool.query('INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [
    OAUTH_MIGRATION_MARKER,
    '1',
  ]);
}

/** 建库、建表、补列、种子管理员密码。幂等，可重复执行。 */
export async function initDatabase() {
  // 1. 建库（不能走 pool，因为 pool 需要库已存在）
  const bootstrap = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    charset: 'utf8mb4_unicode_ci',
    multipleStatements: true,
  });
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await bootstrap.query(`USE \`${config.db.database}\``);
  await bootstrap.query(SCHEMA_SQL);
  await bootstrap.end();

  // 2. 老库补列（权限 / 名称颜色 / 简介）
  await ensureColumn('users', 'name_color', 'name_color VARCHAR(20) NULL AFTER avatar_url');
  await ensureColumn('users', 'bio', 'bio VARCHAR(500) NULL AFTER name_color');
  await ensureColumn('users', 'permissions', 'permissions JSON NULL AFTER bio');
  await ensureColumn('users', 'google_id', 'google_id VARCHAR(255) NULL UNIQUE AFTER github_id');
  await ensureColumn('users', 'remote_avatar_url', 'remote_avatar_url VARCHAR(500) NULL AFTER avatar_url');
  // 绑定表里记录 provider 头像原始地址（供「同步第三方头像」按 provider 取源）
  await ensureColumn('user_oauth_accounts', 'avatar_url', 'avatar_url VARCHAR(500) NULL AFTER provider_user_id');
  // 登录方式图标：icon = 内置图标 key，icon_url = 自定义图片（上传后写 /uploads/images/...）
  await ensureColumn('oauth_providers', 'icon', "icon VARCHAR(50) NOT NULL DEFAULT '' AFTER scope");
  await ensureColumn('oauth_providers', 'icon_url', "icon_url VARCHAR(500) NOT NULL DEFAULT '' AFTER icon");
  await ensureColumn('articles', 'review_state', "review_state ENUM('none','pending','rejected') NOT NULL DEFAULT 'none' AFTER status");
  // 邮件通知订阅：notify_prefs 存 JSON 字符串（NULL = 用服务层默认值）
  await ensureColumn('users', 'notify_prefs', 'notify_prefs TEXT NULL AFTER updated_at');
  await ensureColumn('reviewers', 'email', 'email VARCHAR(255) NULL AFTER display_name');
  await ensureColumn('reviewers', 'notify_prefs', 'notify_prefs TEXT NULL AFTER created_at');
  // 老库补枚举值：登录态改密验证码（幂等，每次启动重放同一句 MODIFY 即可）
  await pool.query("ALTER TABLE email_codes MODIFY COLUMN purpose ENUM('login','register','bind','reset','change-password') NOT NULL DEFAULT 'login'").catch((e) => console.warn('[db] email_codes purpose 枚举迁移失败:', e?.message || e));
  // 彻底删除历史「已注销」存量行（含级联文章），再把 status 枚举回退为两态
  await pool.query("DELETE FROM users WHERE status = 'deleted'").catch(() => {});
  await pool.query("ALTER TABLE users MODIFY COLUMN status ENUM('active','disabled') NOT NULL DEFAULT 'active'").catch(() => {});

  // 3. SSO provider 迁移（旧 settings/env → oauth_providers；users 第三方 ID → user_oauth_accounts）
  await migrateOAuthProviders().catch((e) => console.warn('[db] OAuth provider 迁移失败:', e?.message || e));

  // 4. 独立管理员密码（不再使用管理员用户账号）：不存在才用初始密码种子
  const [pw] = await pool.query("SELECT value FROM settings WHERE `key` = 'admin_password_hash' LIMIT 1");
  if (pw.length === 0) {
    const hash = await bcrypt.hash(config.admin.password, 10);
    await pool.query(
      "INSERT INTO settings (`key`, value) VALUES ('admin_password_hash', ?)",
      [hash]
    );
    console.log('[db] 已写入初始管理密码（可在后台修改）');
  }
}
