module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Keep a readable subject; scopes are not enumerated (the ledger uses I19a etc.)
    'header-max-length': [2, 'always', 120],
  },
};
