#!/usr/bin/env tsx
/**
 * Production server management
 * Replaces: start-prod.sh, stop-prod.sh, prod-logs.sh
 */
import { ServerManager } from './server-manager.js';

const prodServer = new ServerManager({
  name: 'prod-server',
  port: 3110,
  command: 'node',
  args: ['dist/src/server/index.js'],
  env: {
    NODE_ENV: 'production'
  }
});

async function main() {
  const command = process.argv[2] || 'start';

  switch (command) {
    case 'start':
      await prodServer.start();
      break;

    case 'stop':
      await prodServer.stop();
      break;

    case 'restart':
      await prodServer.restart();
      break;

    case 'status':
      await prodServer.status();
      break;

    case 'logs':
      await prodServer.logs(true);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error('\nUsage: npm run prod:server [start|stop|restart|status|logs]');
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
