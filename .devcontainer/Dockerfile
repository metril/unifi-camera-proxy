ARG VARIANT="3.11"
FROM mcr.microsoft.com/devcontainers/python:dev-${VARIANT}-bullseye
WORKDIR /app

RUN apt-get update && apt-get install -y ffmpeg netcat-openbsd

COPY . .
RUN pip install .
