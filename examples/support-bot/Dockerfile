# A Gryt bot, as a container.
#
# Built from the repository root so it can use the SDK sitting next to it:
#
#   docker build -f examples/support-bot/Dockerfile -t my-support-bot .
#
# Once @gryt/bot is on npm this can be a two-line Dockerfile with the example
# folder as its context. Until then it needs the SDK source.
FROM node:22-alpine

WORKDIR /app

# The SDK first, so a change to the bot's own code does not reinstall it.
COPY package.json yarn.lock ./
COPY src ./src
RUN yarn install --frozen-lockfile --production=false && yarn build

WORKDIR /app/bot
COPY examples/support-bot/package.json ./
COPY examples/support-bot/faq.json ./
COPY examples/support-bot/src ./src
RUN yarn install

# Where the identity lives. Mount a volume here or the bot is a stranger on
# every restart — see the compose file next door.
ENV GRYT_IDENTITY_PATH=/data/gryt-bot-identity.json
VOLUME ["/data"]

# Runs as a user that is not root, and owns the volume it writes to.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

CMD ["node", "--experimental-strip-types", "src/index.ts"]
