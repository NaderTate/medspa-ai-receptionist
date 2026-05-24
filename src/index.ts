// HTTP server. Vapi points at POST /vapi/webhook. The health check is handy
// for confirming a deploy is live.

import express from 'express';
import { PORT, SPA } from './config.js';
import { vapiRouter } from './routes/vapi.js';

const app = express();
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ service: `${SPA.name} AI receptionist`, status: 'ok' });
});

app.use('/vapi', vapiRouter);

app.listen(PORT, () => {
  console.log(`${SPA.name} receptionist backend listening on http://localhost:${PORT}`);
  console.log(`Vapi webhook: POST http://localhost:${PORT}/vapi/webhook`);
});
