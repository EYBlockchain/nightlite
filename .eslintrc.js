module.exports = {
  extends: "./node_modules/cod-scripts/eslint.js",
  globals: {
    'BigInt':true
  },
  rules: {
    'no-console': 'off',
    'no-restricted-syntax': 'off',
    'no-plusplus': 'off',
  }
};
