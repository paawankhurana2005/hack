// ReLoop API — skeleton only (Spec 001).
// Boots an Express server exposing a single health endpoint. No data, no logic.

import express from 'express';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[reloop/api] listening on http://localhost:${PORT}`);
});
