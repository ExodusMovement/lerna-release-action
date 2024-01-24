const path = require('path')
module.exports = {
  extends: '../.eslintrc.js',
  ignorePatterns: ['src/action'],
  parserOptions: {
    project: [path.join(__dirname, 'tsconfig.json')],
  },
  rules: {
    'no-console': 'off',
  },
}
