FROM node:18-bullseye-slim
WORKDIR /usr/src/app

# Basic tools for healthcheck and build deps for canvas
RUN apt-get update && apt-get install -y --no-install-recommends \
    netcat-openbsd \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libpango1.0-dev \
    libgif-dev \
    libjpeg-dev \
    librsvg2-dev \
    libpng-dev \
  && rm -rf /var/lib/apt/lists/*

# Install app dependencies (tolerates older lockfiles)
COPY ./src/package*.json ./
RUN npm install --omit=dev

# Bundle app source
COPY src/. .
EXPOSE 80 3000
RUN mkdir -p /usr/src/app/io
VOLUME [ "/usr/src/app/io" ]

# Create non-root user and switch
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

# Ensure writable dirs for runtime
RUN mkdir -p /usr/src/app/public/medias/generated \
  && chown -R appuser:appgroup /usr/src/app/public /usr/src/app/io

USER appuser

# Healthcheck (simple: check if port 3000 is open)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD nc -z localhost 3000 || exit 1

CMD ["npm", "start"]
