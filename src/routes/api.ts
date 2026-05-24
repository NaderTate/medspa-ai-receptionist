// Read-only JSON API the dashboard frontend reads. One endpoint, one payload.

import { Router } from 'express';
import { getDashboardData } from '../lib/dashboard.js';

export const apiRouter = Router();

apiRouter.get('/dashboard', async (_req, res) => {
  const data = await getDashboardData();
  res.json(data);
});
