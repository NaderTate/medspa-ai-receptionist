// HTTP server. Vapi points at POST /vapi/webhook. The health check is handy
// for confirming a deploy is live.

import cors from 'cors';
import express from 'express';
import { PORT, SPA } from './config.js';
import { vapiRouter } from './routes/vapi.js';
import { apiRouter } from './routes/api.js';

const app = express();
app.use(cors()); // the dashboard runs on a different port in dev, so allow cross-origin reads
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ service: `${SPA.name} AI receptionist`, status: 'ok' });
});

app.use('/vapi', vapiRouter);
app.use('/api', apiRouter);

app.listen(PORT, () => {
  console.log(`${SPA.name} receptionist backend listening on http://localhost:${PORT}`);
  console.log(`Vapi webhook: POST http://localhost:${PORT}/vapi/webhook`);
});
