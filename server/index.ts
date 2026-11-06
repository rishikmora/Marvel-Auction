import { createServer } from 'node:http';
import { parse } from 'node:url';
import next from 'next';
import { Server } from 'socket.io';
import { attachSocketServer } from '../src/server/socket';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);

/**
 * Next.js runs inside a custom HTTP server so the auction can share one port with the
 * Socket.IO endpoint. All authoritative game logic lives behind the socket layer.
 */
async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer((req, res) => {
    try {
      handle(req, res, parse(req.url ?? '/', true));
    } catch (error) {
      console.error('[http] request failed', error);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  const io = new Server(server, {
    path: '/api/realtime',
    // Rooms are small and chatty; websockets first keeps bid latency low.
    transports: ['websocket', 'polling'],
    pingInterval: 20000,
    pingTimeout: 25000,
    maxHttpBufferSize: 1e5,
    cors: dev ? { origin: true, credentials: true } : undefined,
  });

  attachSocketServer(io);

  server.listen(port, hostname, () => {
    const shown = hostname === '0.0.0.0' ? 'localhost' : hostname;
    console.log(`\n  MARVEL: THE AUCTION`);
    console.log(`  ready on http://${shown}:${port}`);
    console.log(`  realtime channel: /api/realtime\n`);
  });

  const shutdown = () => {
    console.log('\n  shutting down...');
    io.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[server] fatal', error);
  process.exit(1);
});
