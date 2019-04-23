
module.exports = {
  'env': {
    'browser': true,
    'es6': true,
    'jest': true
  },
  'extends': ['standard'],
  'globals': {
    'Atomics': 'readonly',
    'SharedArrayBuffer': 'readonly'
  },
  'parser': 'babel-eslint',
  'plugins': [
    'standard',
    'flowtype',
    'import',
    'node',
    'promise'
  ],
  'rules': {
    "no-useless-escape": 0
  }
}
