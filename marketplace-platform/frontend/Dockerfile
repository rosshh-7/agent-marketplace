# Frontend-only Dockerfile. The top-level docker-compose.yml (a separate
# pass, per PLATFORM_CONTRACT.md §1/§11) will decide how this container is
# wired to the backend — this build is self-contained and produces a static
# bundle served by nginx.
#
# Three stages: `deps` (shared), `dev` (webpack-dev-server + hot reload, used
# by docker-compose.dev.yml), and the default/last stage `production` (static
# build served by nginx — what plain `docker compose up`/`docker build` gives
# you, since an unspecified --target always resolves to the last stage).

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "start"]

FROM deps AS build
COPY . .

# Build-time API base URL — see webpack.config.js and PLATFORM_CONTRACT.md
# §10. Empty string means "same origin as this container", which is correct
# when a reverse proxy in front of this container also routes /api to the
# backend. Override at build time (--build-arg API_BASE_URL=https://...) if
# the backend is reachable at a different origin.
ARG API_BASE_URL=""
ENV API_BASE_URL=${API_BASE_URL}
RUN npm run build

FROM nginx:1.27-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
