import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApiRouter } from './server/routes/apiRoutes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || '3000');

async function startServer() {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

  app.use('/api', createApiRouter());

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');

    // Admin App Vite middleware mounted strictly at /admin (never linked from Citizen App)
    const adminVite = await createViteServer({
      configFile: path.resolve(__dirname, 'admin-app/vite.config.ts'),
      server: { middlewareMode: true, hmr: false },
      appType: 'custom',
    });

    // Citizen App Vite middleware mounted at /
    const citizenVite = await createViteServer({
      configFile: path.resolve(__dirname, 'citizen-app/vite.config.ts'),
      server: { middlewareMode: true, hmr: false },
      appType: 'custom',
    });

    app.use('/admin', adminVite.middlewares);
    app.get(/^\/admin(\/.*)?$/, async (req: Request, res: Response, next) => {
      try {
        const htmlPath = path.resolve(__dirname, 'admin-app/index.html');
        const template = fs.readFileSync(htmlPath, 'utf-8');
        const html = await adminVite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (err) {
        next(err);
      }
    });

    app.use(citizenVite.middlewares);
    app.get('*', async (req: Request, res: Response, next) => {
      if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/admin')) {
        next();
        return;
      }
      try {
        const htmlPath = path.resolve(__dirname, 'citizen-app/index.html');
        const template = fs.readFileSync(htmlPath, 'utf-8');
        const html = await citizenVite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const adminDist = path.resolve(__dirname, 'admin-app/dist');
    const citizenDist = path.resolve(__dirname, 'citizen-app/dist');

    app.use('/admin', express.static(adminDist));
    app.get(/^\/admin(\/.*)?$/, (_req: Request, res: Response) => {
      res.sendFile(path.join(adminDist, 'index.html'));
    });

    app.use(express.static(citizenDist));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(citizenDist, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `NAGRIK shared backend listening on http://0.0.0.0:${PORT} (Citizen App: /, Admin App: /admin, DEMO_MODE=${process.env.DEMO_MODE === 'true'})`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start NAGRIK server:', err);
  process.exit(1);
});
