/**
 * Architecture boundaries (I19d).
 *
 * These rules encode the layering that the bundler/tsconfig aliases already
 * imply: client never imports server code, server never imports client code,
 * and shared code never reaches into either runtime side.
 */
module.exports = {
  forbidden: [
    {
      name: 'client-no-server',
      severity: 'error',
      comment: 'Client bundles must not import server-only code.',
      from: { path: '^client/src/' },
      to: { path: '^src/server/' },
    },
    {
      name: 'server-no-client',
      severity: 'error',
      comment: 'Server code must not depend on the browser client.',
      from: { path: '^src/server/' },
      to: { path: '^client/src/' },
    },
    {
      name: 'shared-no-runtime',
      severity: 'error',
      comment: 'shared/ is runtime-agnostic; it must not import client or server code.',
      from: { path: '^shared/' },
      to: { path: '^(client/src|src/server)/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make ownership and test impact opaque.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: '(^|/)(dist|dist-client|dist-electron|coverage|tmp|tests/e2e/archived|tests/archived)/',
    },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json'],
    },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/(@[^/]+/[^/]+|[^/]+)' },
    },
  },
};
