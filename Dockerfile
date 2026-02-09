FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

RUN mkdir -p temp_uploads

EXPOSE 6666

ENV NODE_ENV=production

CMD ["node", "server.js"]
