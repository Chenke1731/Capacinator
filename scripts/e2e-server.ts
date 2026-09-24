#!/usr/bin/env tsx
/**
 * E2E server management
 * Replaces: e2e-server-manager.sh
 */
import { ServerManager } from './server-manager.js';

const e2eServer = new ServerManager({
  name: 'e2e-server',
  port: 3111,
  command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
  args: ['run', 'dev:server'],
  env: {
    // NODE_ENV=e2e makes the server use .e2e-data/e2e-test.db (init-e2e path) —
    // the same database globalSetup spawns. Previously 'test' bound data/e2e-test.db.
    NODE_ENV: 'e2e',
    PORT: '3111'
  }
});

async function main() {
  const command = process.argv[2] || 'start';

  switch (command) {
    case 'start':
      await e2eServer.start();
      break;

    case 'stop':
      await e2eServer.stop();
      break;

    case 'restart':
      await e2eServer.restart();
      break;

    case 'status':
      await e2eServer.status();
      break;

    case 'logs':
      await e2eServer.logs(true);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error('\nUsage: npm run e2e:server [start|stop|restart|status|logs]');
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
