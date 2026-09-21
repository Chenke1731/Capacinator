#!/usr/bin/env tsx
/**
 * Cross-platform script to clean up orphaned Capacinator processes
 * Replaces: cleanup-orphaned-processes.sh
 */
import {
  findProcessesByPattern,
  killProcess,
  killPort,
  getTempDir,
  deletePid
} from './utils/process-manager.js';
import * as fs from 'fs';
import * as path from 'path';

const PORTS = [3110, 3120, 3111]; // dev server, dev client, e2e server

async function main() {
  console.log('🧹 Cleaning up orphaned Capacinator processes...\n');

  // Find and kill orphaned Vite DEV processes.
  // `vite preview` (port 3121, the production-preview entry) matches the same
  // pattern — it is a deliberately long-running server, never an orphan.
  console.log('Checking for orphaned Vite processes...');
  const allVitePids = await findProcessesByPattern('vite.*client-vite.config.ts');
  const vitePids: number[] = [];
  for (const pid of allVitePids) {
    const isPreview = await findProcessesByPattern(`^\\S+\\s+${pid}\\s+.*preview`)
      .then((r) => r.length > 0)
      .catch(() => false);
    if (!isPreview) vitePids.push(pid);
  }

  if (vitePids.length > 0) {
    console.log(`Found orphaned Vite processes: ${vitePids.join(', ')}`);
    for (const pid of vitePids) {
      await killProcess(pid, 'SIGKILL');
    }
    console.log('✅ Killed orphaned Vite processes');
  }

  // Find and kill orphaned TSX server processes
  console.log('Checking for orphaned server processes...');
  const tsxPids = await findProcessesByPattern('tsx.*src/server/index.ts');

  if (tsxPids.length > 0) {
    console.log(`Found orphaned TSX processes: ${tsxPids.join(', ')}`);
    for (const pid of tsxPids) {
      await killProcess(pid, 'SIGKILL');
    }
    console.log('✅ Killed orphaned TSX processes');
  }

  // Kill any processes on our standard ports
  console.log(`\nChecking ports ${PORTS.join(', ')}...`);
  for (const port of PORTS) {
    const killed = await killPort(port, true);
    if (killed > 0) {
      console.log(`✅ Freed port ${port} (killed ${killed} process(es))`);
    }
  }

  // Clean up old PID files
  console.log('\nCleaning up PID files...');
  const tempDir = getTempDir();

  try {
    const files = fs.readdirSync(tempDir);
    const pidFiles = files.filter(f => f.endsWith('.pid'));

    for (const file of pidFiles) {
      fs.unlinkSync(path.join(tempDir, file));
    }

    if (pidFiles.length > 0) {
      console.log(`✅ Removed ${pidFiles.length} PID file(s)`);
    }
  } catch (error) {
    // Temp dir might not exist, that's okay
  }

  console.log('\n✅ Cleanup complete!');
  console.log(`\nPorts ${PORTS.join(', ')} should now be free.`);
  console.log('You can start the dev server with: npm run dev');
}

main().catch(err => {
  console.error('Error during cleanup:', err);
  process.exit(1);
});
