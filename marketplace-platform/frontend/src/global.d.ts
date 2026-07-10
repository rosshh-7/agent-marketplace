// Injected by webpack.DefinePlugin at build time — see webpack.config.js.
// Base URL to prefix onto API requests. Empty string means "same origin"
// (used in dev via the webpack-dev-server proxy, and in prod when the
// frontend is served from the same origin as the backend).
declare const __API_BASE_URL__: string;

// Webpack asset/resource imports (see webpack.config.js) — importing a .py
// file yields its emitted URL. TypeScript can't see webpack rules, so this
// declaration keeps `tsc --noEmit` in the loop.
declare module '*.py' {
  const url: string;
  export default url;
}
