FROM node:22-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5207 DATABASE_PATH=/data/league.sqlite
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && mkdir /data && chown node:node /data
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
USER node
EXPOSE 5207
CMD ["node", "src/main.mjs"]
