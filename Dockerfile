FROM node:10-alpine

ADD app/package.json /app/package.json
ADD app/package-lock.json /app/package-lock.json

WORKDIR /app
RUN npm install --cache /tmp/empty-cache && rm -rf /tmp/empty-cache

ADD app /app

RUN node_modules/.bin/tsc

ENTRYPOINT ["node", "src/index.js"]