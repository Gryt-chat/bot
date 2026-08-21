# A Gryt bot, as a container.
#
#   docker build -t my-support-bot .
#
# The example folder is the whole build context: @gryt/bot comes from npm like
# any other dependency, so nothing outside this directory is needed. Copy the
# folder somewhere else and it still builds.
FROM node:22-alpine

WORKDIR /app

# Dependencies first, so editing the bot does not reinstall them.
COPY package.json ./
RUN npm install --omit=dev

COPY faq.json ./
COPY src ./src

# Where the identity lives. Mount a volume here or the bot is a stranger on
# every restart — see the compose file next door.
ENV GRYT_IDENTITY_PATH=/data/gryt-bot-identity.json
VOLUME ["/data"]

# Runs as a user that is not root, and owns the volume it writes to.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

CMD ["node", "--experimental-strip-types", "src/index.ts"]
