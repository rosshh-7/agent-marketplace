const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  // Build-time API base URL (see PLATFORM_CONTRACT.md §10/§9).
  // In dev, the webpack-dev-server proxy forwards /api and the SDK callback
  // routes to the backend, so we keep API_BASE_URL as an empty string (same
  // origin) unless explicitly overridden — this also matches how the app
  // behaves in production, where it's served from the same origin as /api.
  const apiBaseUrl = process.env.API_BASE_URL || (isProduction ? '' : '');

  return {
    entry: path.resolve(__dirname, 'src', 'index.tsx'),
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProduction ? 'assets/[name].[contenthash].js' : 'assets/[name].js',
      publicPath: '/',
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      modules: [path.resolve(__dirname, 'src'), 'node_modules'],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          // tsconfig.json sets noEmit: true (it's also used for `tsc --noEmit`
          // type-checking), so override it here — webpack needs ts-loader to
          // actually emit JS for it to bundle.
          use: { loader: 'ts-loader', options: { compilerOptions: { noEmit: false } } },
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, 'public', 'index.html'),
      }),
      new webpack.DefinePlugin({
        __API_BASE_URL__: JSON.stringify(apiBaseUrl),
      }),
    ],
    devServer: {
      // 3001 rather than the classic 3000: every second dev tool defaults to
      // 3000, so this avoids silent port collisions with other local apps.
      port: 3001,
      // 0.0.0.0 so the dev server is reachable from outside its container
      // (docker-compose.dev.yml) as well as on the host (`npm start`).
      host: '0.0.0.0',
      historyApiFallback: true,
      static: path.resolve(__dirname, 'public'),
      proxy: [
        {
          // REST API — see PLATFORM_CONTRACT.md §4. Defaults to the backend
          // on the host (`npm start` case); docker-compose.dev.yml overrides
          // this to http://backend:8000 (the service name on
          // agentmarket-net), since "localhost" inside the frontend dev
          // container would otherwise mean the container itself.
          context: ['/api'],
          target: process.env.BACKEND_PROXY_URL || 'http://localhost:8001',
          changeOrigin: true,
        },
      ],
    },
    performance: {
      hints: false,
    },
  };
};
