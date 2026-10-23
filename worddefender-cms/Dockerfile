FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --include=dev --legacy-peer-deps
COPY . .
RUN npm run build
EXPOSE 1337
CMD ["npm", "run", "start"]
