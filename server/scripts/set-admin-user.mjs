import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const EMAIL = 'admin@admin.local';
const PASSWORD = '123456';

const [before] = await pool.query('SELECT id, email, name, status, email_verified FROM users WHERE id = 1 LIMIT 1');
console.log('before:', JSON.stringify(before));

const hash = await bcrypt.hash(PASSWORD, 10);
await pool.query(
  "UPDATE users SET email = ?, password_hash = ?, email_verified = 1, status = 'active' WHERE id = 1",
  [EMAIL, hash],
);

const [after] = await pool.query('SELECT id, email, name, status, email_verified FROM users WHERE id = 1 LIMIT 1');
console.log('after:', JSON.stringify(after));
console.log('password ok:', await bcrypt.compare(PASSWORD, (await pool.query('SELECT password_hash FROM users WHERE id = 1'))[0][0].password_hash));
await pool.end();
