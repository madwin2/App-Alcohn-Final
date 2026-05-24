FROM mcr.microsoft.com/playwright:v1.51.0-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm run playwright:install

COPY tsconfig.json ./
COPY src ./src
COPY fixtures ./fixtures

RUN npm install --include=dev && npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV MICORREO_HEADLESS=true
EXPOSE 8787

CMD ["node", "dist/index.js"]
