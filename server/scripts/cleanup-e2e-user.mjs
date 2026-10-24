import { pool } from '../src/db.js';
try {
  const [r] = await pool.query('DELETE FROM users WHERE email LIKE ? AND name = ?', [
    'e2e-welcome-%@test.local',
    '欢迎邮件测试',
  ]);
  console.log('已删测试用户', r.affectedRows, '个');
} catch (e) {
  console.error('清理失败:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
