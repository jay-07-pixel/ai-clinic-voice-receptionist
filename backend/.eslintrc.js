module.exports = {
  env: {
    node: true,
    es2022: true,
  },
  extends: ['eslint:recommended', 'plugin:node/recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 2022,
  },
  rules: {
    'no-console': 'off',
    'node/no-unpublished-require': 'off',
    'node/no-missing-require': 'off',
  },
};
