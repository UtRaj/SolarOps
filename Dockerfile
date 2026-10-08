FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps --no-fund --no-audit

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/index.html ./index.html
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/src ./src
COPY --from=build /app/vite.config.ts ./vite.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
