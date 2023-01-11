const path = require('path')
module.exports = {
  extends: '../.eslintrc.js',
  parserOptions: {
    project: [path.join(__dirname, 'tsconfig.json')],
  },
  rules: {
    'no-console': 'off',
  },
}
