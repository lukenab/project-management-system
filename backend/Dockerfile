# syntax=docker/dockerfile:1

# Comments are provided throughout this file to help you get started.
# If you need more help, visit the Dockerfile reference guide at
# https://docs.docker.com/go/dockerfile-reference/

# This Dockerfile uses Docker Hardened Images (DHI) for enhanced security.
# For more information, see https://docs.docker.com/dhi/

ARG NODE_VERSION=24.14.0-slim

# Builder stage: install all dependencies and compile TypeScript.
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

# Install dependencies as a separate step to take advantage of Docker's
# caching. Leverage a cache mount to /root/.npm to speed up subsequent
# builds. Leverage a bind mount to package.json to avoid having to copy
# it into this layer.
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=package.json,target=package.json \
    npm install
# Once you create a package-lock.json by running npm install locally, switch to npm ci and bind both files:
# RUN --mount=type=cache,target=/root/.npm \
#     --mount=type=bind,source=package.json,target=package.json \
#     --mount=type=bind,source=package-lock.json,target=package-lock.json \
#     npm ci

# Copy the source code into the container and compile TypeScript.
COPY . .
RUN npm run build


# Deps stage: install production dependencies only.
FROM node:${NODE_VERSION} AS deps

WORKDIR /app

RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=package.json,target=package.json \
    npm install --omit=dev
# Once you create a package-lock.json by running npm install locally, switch to npm ci and bind both files:
# RUN --mount=type=cache,target=/root/.npm \
#     --mount=type=bind,source=package.json,target=package.json \
#     --mount=type=bind,source=package-lock.json,target=package-lock.json \
#     npm ci --omit=dev
# Runner stage: minimal runtime image with compiled app and production deps.
FROM node:${NODE_VERSION} AS runner

ENV PATH=/app/node_modules/.bin:$PATH
ENV PORT=3000

WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist

# Expose the port that the application listens on.
EXPOSE 3000

# Run the application.
CMD ["node", "dist/index.js"]
