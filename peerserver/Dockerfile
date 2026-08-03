FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
ENV PORT=9000
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=4s CMD wget -qO- http://localhost:9000/health || exit 1
CMD ["node", "server.js"]
