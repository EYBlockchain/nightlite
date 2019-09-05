FROM node:12

ARG NPM_TOKEN

RUN mkdir /app
WORKDIR /app

COPY ./package.json ./package-lock.json ./.npmrc ./
RUN npm ci

# prevent auth failures when running npm run scripts
# file only necessary for above `npm ci` command
RUN rm .npmrc

COPY ./jest.config.js ./jest.setup.js ./.babelrc ./

EXPOSE 80
CMD ["npm", "start"]
