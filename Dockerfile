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

RUN apk add --update curl ffmpeg netcat-openbsd libusb-dev openssl

# Bundle go2rtc (streaming server for live preview + mosaic fan-out).
ARG TARGETARCH
ARG GO2RTC_VERSION=1.9.9
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
      amd64) GO2RTC_ARCH="amd64" ;; \
      arm64) GO2RTC_ARCH="arm64" ;; \
      arm)   GO2RTC_ARCH="arm" ;; \
      *)     GO2RTC_ARCH="amd64" ;; \
    esac; \
    curl -fsSL -o /usr/local/bin/go2rtc \
      "https://github.com/AlexxIT/go2rtc/releases/download/v${GO2RTC_VERSION}/go2rtc_linux_${GO2RTC_ARCH}"; \
    chmod +x /usr/local/bin/go2rtc; \
    go2rtc --version || true

COPY . .
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
RUN pip install -e . --no-cache-dir

COPY ./docker/entrypoint.sh /

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -sf http://localhost:8080/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["unifi-camera-proxy-web"]
