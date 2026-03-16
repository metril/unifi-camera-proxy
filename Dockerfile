ARG version=3.11
ARG tag=${version}-alpine3.20

# Stage 1: Python dependency builder
FROM python:${tag} AS builder
WORKDIR /app
ENV CARGO_NET_GIT_FETCH_WITH_CLI=true

RUN apk add --update \
    cargo \
    git \
    gcc \
    g++ \
    jpeg-dev \
    libc-dev \
    linux-headers \
    musl-dev \
    patchelf \
    rust \
    zlib-dev

RUN pip install -U pip wheel setuptools maturin
COPY requirements.txt .
RUN pip install -r requirements.txt --no-build-isolation

# Stage 2: Frontend builder
FROM --platform=$BUILDPLATFORM node:24-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 3: Final image
FROM python:${tag}
WORKDIR /app

ARG version

COPY --from=builder \
    /usr/local/lib/python${version}/site-packages \
    /usr/local/lib/python${version}/site-packages

RUN apk add --update ffmpeg netcat-openbsd libusb-dev

COPY . .
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
RUN pip install -e . --no-cache-dir

COPY ./docker/entrypoint.sh /

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
CMD ["unifi-cam-proxy"]
