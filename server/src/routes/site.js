import { Router } from 'express';
import { publicSiteInfo } from '../services/settings.js';

export const siteRouter = Router();

siteRouter.get('/site', async (_req, res, next) => {
  try {
    res.json(await publicSiteInfo());
  } catch (e) {
    next(e);
  }
});
