/**
 * 一次性/兜底清理：删除所有冒烟与 e2e 测试残留用户（文章经外键级联删除）。
 * 匹配规则：邮箱以 @test.local / @shimmer.dev 结尾，或以 e2e-welcome- 开头。
 * 用法：node scripts/cleanup-test-users.mjs
 */
import { pool } from '../src/db.js';

await pool.query('SELECT 1');
const [rows] = await pool.query(
  "SELECT id, name, email FROM users WHERE id != 1 AND (email LIKE '%@test.local' OR email LIKE '%@shimmer.dev' OR email LIKE 'e2e-welcome-%')"
);
if (!rows.length) {
  console.log('无测试残留用户');
} else {
  for (const u of rows) {
    await pool.query('DELETE FROM users WHERE id = ?', [u.id]);
    console.log(`已删除 id=${u.id} ${u.name} <${u.email}>`);
  }
  console.log(`共清理 ${rows.length} 个测试用户`);
}
const [rest] = await pool.query('SELECT COUNT(*) AS n FROM users');
console.log(`剩余用户数（含 admin）：${rest[0].n}`);
await pool.end();
