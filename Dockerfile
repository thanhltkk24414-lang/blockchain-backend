# Fapex backend — production image for Railway, Render, or any Docker host.
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only (Hardhat/ethers stay in devDependencies).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production

# Platforms inject PORT at runtime; default matches local dev.
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||5000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["npm", "start"]
