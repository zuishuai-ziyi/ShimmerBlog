import { Router } from 'express';
import { pool } from '../db.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: true, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, db: false, error: e.code ?? String(e) });
  }
});
