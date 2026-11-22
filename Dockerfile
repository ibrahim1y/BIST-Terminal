# Yayın için tek imaj. Önce arayüz derlenir, sonra backend hem API'yi hem derlenmiş arayüzü sunar.

# 1. Arayüzün derlenmesi
FROM node:24-alpine AS arayuz
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. Backend
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/ ./
COPY --from=arayuz /app/frontend/dist /app/frontend/dist

# Barındırma servisi portu PORT ortam değişkeniyle verir.
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
