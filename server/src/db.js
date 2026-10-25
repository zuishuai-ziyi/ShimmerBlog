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
  purpose ENUM('login','register','bind','reset') NOT NULL DEFAULT 'login',
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
  await pool.query("ALTER TABLE email_codes MODIFY COLUMN purpose ENUM('login','register','bind','reset') NOT NULL DEFAULT 'login'").catch(() => {});
  // 彻底删除历史「已注销」存量行（含级联文章），再把 status 枚举回退为两态
  await pool.query("DELETE FROM users WHERE status = 'deleted'").catch(() => {});
  await pool.query("ALTER TABLE users MODIFY COLUMN status ENUM('active','disabled') NOT NULL DEFAULT 'active'").catch(() => {});

  // 3. 独立管理员密码（不再使用管理员用户账号）：不存在才用初始密码种子
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
