FROM node:22.22.0-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY index.js ./

ENV NODE_ENV=production

ENTRYPOINT ["node", "index.js"]
