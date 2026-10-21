FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
USER node
ENV NODE_ENV=production PORT=3000 SERVICE_ROLE=web
EXPOSE 3000
CMD ["node", "src/main.mjs"]
