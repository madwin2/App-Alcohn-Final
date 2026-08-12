FROM mcr.microsoft.com/playwright:v1.51.0-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npx playwright install chromium

COPY tsconfig.json ./
COPY src ./src
COPY fixtures ./fixtures

RUN npm install --include=dev && npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV ANDREANI_HEADLESS=true
EXPOSE 8788

CMD ["node", "dist/index.js"]
