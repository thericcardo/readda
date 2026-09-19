/* Readda - configurazione del linter.
 * L'app e' fatta di script classici, non di moduli: nessun import, tutto
 * appeso a window.Readda. La configurazione dichiara i tre ambienti che
 * convivono nel repository (pagina, service worker, prove in Node) perche'
 * altrimenti il linter segnala come indefinite le variabili di piattaforma. */

const BROWSER = {
  window: 'writable', document: 'readonly', location: 'readonly', navigator: 'readonly',
  localStorage: 'readonly', Notification: 'readonly', fetch: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
  clearInterval: 'readonly', console: 'readonly', btoa: 'readonly', atob: 'readonly',
  escape: 'readonly', unescape: 'readonly', crypto: 'readonly',
  innerWidth: 'readonly', innerHeight: 'readonly', getComputedStyle: 'readonly',
  Promise: 'readonly', Set: 'readonly', Map: 'readonly', Intl: 'readonly',
  Readda: 'writable'
};

const NODE = {
  require: 'readonly', module: 'writable', exports: 'writable', process: 'readonly',
  __dirname: 'readonly', __filename: 'readonly', Buffer: 'readonly', global: 'readonly',
  console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  Promise: 'readonly', Set: 'readonly', Map: 'readonly'
};

const REGOLE = {
  'no-undef': 'error',
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-fallthrough': 'error',
  'no-self-compare': 'error',
  'no-cond-assign': 'error',
  'no-constant-condition': 'error',
  'valid-typeof': 'error',
  'use-isnan': 'error'
};

export default [
  { ignores: ['data/**', 'node_modules/**', 'artefatto/**', 'strumenti/curati.js'] },
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2020, sourceType: 'script', globals: BROWSER },
    rules: REGOLE
  },
  {
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 2020, sourceType: 'script',
      globals: { self: 'readonly', caches: 'readonly', clients: 'readonly',
                 fetch: 'readonly', Promise: 'readonly', Object: 'readonly' }
    },
    rules: REGOLE
  },
  {
    files: ['test/**/*.js'],
    // le prove eseguono anche codice dentro il browser (page.evaluate):
    // li' valgono le globali della pagina, non quelle di Node
    languageOptions: { ecmaVersion: 2022, sourceType: 'script',
                       globals: Object.assign({}, NODE, BROWSER) },
    rules: REGOLE
  }
];
