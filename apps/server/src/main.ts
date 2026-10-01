import { createServer } from 'node:http';

// Bootstrap entry. Replaced by the full composition root in Phase 4 (LLD SP-20).
const DEFAULT_PORT = 3000;
const port = Number(process.env.PORT ?? DEFAULT_PORT);

const server = createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404).end();
});

server.listen(port);
