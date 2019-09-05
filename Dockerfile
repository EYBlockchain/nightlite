ARG NPM_TOKEN

# build & code linting stage
FROM node:12 as builder
ARG NPM_TOKEN
RUN mkdir /app
WORKDIR /app
COPY ./package.json ./package-lock.json ./.babelrc ./.npmrc ./
RUN npm ci
COPY ./src ./src
COPY ./contracts/test ./contracts/test
COPY ./README.md .
COPY ./.eslintrc.js ./.prettierrc.js ./.markdownlint.json ./.soliumrc.json ./
RUN npm run validate
RUN npm run build

# truffle build stage
FROM ajmay/truffle:5.0.9 as truffle-builder
ARG NPM_TOKEN
COPY ./contracts ./contracts
COPY ./truffle/package.json ./truffle/package-lock.json ./.npmrc ./
ENV SOLC_VERSION ^0.5.5
RUN npm ci
RUN truffle compile --all

# api testing stage
FROM node:12
ARG NPM_TOKEN
RUN mkdir /app
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=truffle-builder /truffle/build/contracts ./build/contracts
COPY ./package.json ./jest.config.js ./jest.setup.js ./
RUN npm run test:ci

# install production dependencies. separate step to protect env secrets
FROM node:12 as prod-dependencies
ARG NPM_TOKEN
RUN mkdir /app
WORKDIR /app
COPY ./package.json ./package-lock.json ./.npmrc ./
RUN npm ci --only=prod

# production image stage
FROM node:12
RUN mkdir /app
WORKDIR /app
COPY ./package.json ./package-lock.json ./
COPY --from=prod-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=truffle-builder /truffle/build/contracts ./build/contracts
COPY ./config ./config
EXPOSE 80
CMD ["npm", "start"]
