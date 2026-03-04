# Gemini Watermark Remover

A **Next.js 16** web application that removes or obscures watermarks from images using [Jimp](https://github.com/jimp-dev/jimp). It ships with a full production-grade setup: multi-arch Docker image, Kubernetes manifests, Prometheus metrics, and a Grafana dashboard provisioned via Helm.

---

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Docker](#docker)
  - [Build the Image](#build-the-image)
  - [Run the Container](#run-the-container)
  - [Multi-arch Push to Registry](#multi-arch-push-to-registry)
- [Kubernetes](#kubernetes)
  - [Deploy the App](#deploy-the-app)
  - [Verify the Deployment](#verify-the-deployment)
  - [Access the App](#access-the-app)
  - [Rolling Restart / Image Update](#rolling-restart--image-update)
- [Monitoring with Prometheus & Grafana (Helm)](#monitoring-with-prometheus--grafana-helm)
  - [1. Add the Helm Repository](#1-add-the-helm-repository)
  - [2. Create the Monitoring Namespace](#2-create-the-monitoring-namespace)
  - [3. Create the Grafana Admin Secret](#3-create-the-grafana-admin-secret)
  - [4. Install kube-prometheus-stack](#4-install-kube-prometheus-stack)
  - [5. Apply Monitoring Manifests](#5-apply-monitoring-manifests)
  - [6. Access Grafana & Prometheus](#6-access-grafana--prometheus)
  - [7. Import the Dashboard](#7-import-the-dashboard)
- [API Endpoints](#api-endpoints)
- [Alerting Rules](#alerting-rules)
- [Project Structure](#project-structure)

---

## Features

- Upload an image and remove / blur / fill watermarks with configurable settings
- Four processing methods: **remove**, **blur**, **fill**, **inpaint**
- Built-in Prometheus metrics endpoint (`/api/metrics`) with request counters, latency histograms, and error rates
- Health-check endpoint (`/api/health`) used by Kubernetes probes
- Production Docker image built on `node:20-alpine` using a four-stage build (slim standalone output)
- Kubernetes Deployment with 5 replicas, resource limits, startup/readiness/liveness probes
- Full observability stack: Prometheus + Grafana + Alertmanager deployed via `kube-prometheus-stack` Helm chart
- Pre-built Grafana dashboard auto-provisioned via ConfigMap
- PrometheusRule alerts for pod health, CPU, and memory

---

## Architecture Overview

```
Browser
  │
  └─► NodePort :30080 ──► watermark-app Service (namespace: watermark-app)
                                  │
                          Deployment (5 replicas)
                          image: ghcr.io/tauqeerahmad5201/gemini-watermark:latest
                                  │
                          /api/metrics  ◄── ServiceMonitor ◄── Prometheus
                                                                    │
                                                                Grafana  (port 30300)
                                                                Alertmanager (port 30093)
```

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 20+ |
| Docker | 24+ (with `buildx` for multi-arch) |
| kubectl | 1.28+ |
| Helm | 3.12+ |
| Kubernetes cluster | Docker Desktop, minikube, kind, or any cloud cluster |

---

## Local Development

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev
# → http://localhost:3000

# Lint
npm run lint

# Production build (output: .next/standalone)
npm run build
npm start
```

---

## Docker

### Build the Image

```bash
docker build -t gemini-watermark:latest .
```

The Dockerfile uses a **four-stage build**:

| Stage | Purpose |
|-------|---------|
| `base` | `node:20-alpine` base layer |
| `deps` | Install `node_modules` with `npm ci` |
| `builder` | Run `npm run build` to produce the standalone output |
| `runner` | Minimal production image — only the standalone files are copied |

### Run the Container

```bash
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  gemini-watermark:latest
```

Then open [http://localhost:3000](http://localhost:3000).

Verify the endpoints:

```bash
# Health check
curl http://localhost:3000/api/health

# Prometheus metrics
curl http://localhost:3000/api/metrics
```

### Multi-arch Push to Registry

The published image supports both `linux/amd64` and `linux/arm64` (Apple Silicon + cloud VMs):

```bash
# Authenticate first
docker login ghcr.io -u <your-github-username>

# Build and push
docker buildx build --no-cache \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/tauqeerahmad5201/gemini-watermark:latest \
  --push \
  .
```

---

## Kubernetes

All manifests live under `k8s/`. Apply them in the order shown below.

### Deploy the App

```bash
# 1. Create the application namespace
kubectl apply -f k8s/app/namespace.yaml

# 2. Deploy the application (Deployment + Service)
kubectl apply -f k8s/app/deployment.yaml
kubectl apply -f k8s/app/service.yaml
```

Deployment highlights:

| Setting | Value |
|---------|-------|
| Replicas | 5 |
| Image | `ghcr.io/tauqeerahmad5201/gemini-watermark:latest` |
| CPU request / limit | 100m / 500m |
| Memory request / limit | 128Mi / 512Mi |
| Health check path | `/api/health` |
| Metrics path | `/api/metrics` |

### Verify the Deployment

```bash
# Watch the rollout until complete
kubectl rollout status deployment/watermark-app -n watermark-app

# List pods
kubectl get pods -n watermark-app

# Tail logs from all pods
kubectl logs -l app=watermark-app -n watermark-app --tail=50 --follow
```

### Access the App

The Service is of type `NodePort` and exposes port **30080**:

```bash
# Via NodePort (when the cluster node is reachable directly)
open http://<NODE_IP>:30080

# Via port-forward (recommended for local clusters)
kubectl port-forward -n watermark-app svc/watermark-app 3002:80
open http://localhost:3002
```

### Rolling Restart / Image Update

```bash
# After pushing a new image tag, trigger a rolling restart:
kubectl rollout restart deployment/watermark-app -n watermark-app

# Monitor the progress
kubectl rollout status deployment/watermark-app -n watermark-app
```

---

## Monitoring with Prometheus & Grafana (Helm)

The monitoring stack uses the **kube-prometheus-stack** Helm chart, which bundles Prometheus, Grafana, and Alertmanager in a single release.

### 1. Add the Helm Repository

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

### 2. Create the Monitoring Namespace

```bash
kubectl create namespace monitoring
```

### 3. Create the Grafana Admin Secret

Credentials are injected via a Kubernetes Secret so they are never stored in the Helm values file.

```bash
kubectl create secret generic grafana-admin-secret \
  --from-literal=admin-user=admin \
  --from-literal=admin-password='<your-strong-password>' \
  -n monitoring
```

Alternatively, edit `k8s/monitoring/grafana-secret.yaml` with a strong password (this file is gitignored) and apply it:

```bash
# Edit admin-password in grafana-secret.yaml first, then:
kubectl apply -f k8s/monitoring/grafana-secret.yaml
```

### 4. Install kube-prometheus-stack

```bash
helm upgrade --install kube-prometheus-stack \
  prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  -f k8s/monitoring/helm-values.yaml
```

This installs (or upgrades to) the chart with the following configuration from `helm-values.yaml`:

| Component | NodePort | Description |
|-----------|----------|-------------|
| Grafana | **30300** | Dashboard & visualization |
| Prometheus | **30090** | Metrics store & alerting engine |
| Alertmanager | **30093** | Alert routing & notifications |

Key settings applied:
- Admin credentials read from the `grafana-admin-secret` Kubernetes Secret
- Dashboard sidecar enabled — any ConfigMap labelled `grafana_dashboard=1` is auto-imported
- `serviceMonitorSelector: {}` + `serviceMonitorNamespaceSelector: {}` — Prometheus watches **all** namespaces for ServiceMonitors
- Metrics retention: **15 days**

Verify all pods are running:

```bash
kubectl get pods -n monitoring
kubectl get svc -n monitoring
```

### 5. Apply Monitoring Manifests

```bash
# ServiceMonitor — instructs Prometheus to scrape /api/metrics every 15 s
kubectl apply -f k8s/monitoring/servicemonitor.yaml

# PrometheusRule — alerting rules for pod health, CPU, and memory
kubectl apply -f k8s/monitoring/alerts.yaml

# Grafana dashboard ConfigMap (picked up automatically by the sidecar)
kubectl apply -f k8s/monitoring/grafana-dashboard-configmap.yaml
```

Confirm the ServiceMonitor is discovered by Prometheus:

```bash
kubectl get servicemonitor -n monitoring
# Prometheus UI → Status → Targets → look for "watermark-app"
```

### 6. Access Grafana & Prometheus

#### Option A — NodePort (cluster node directly reachable)

| Service | URL |
|---------|-----|
| Grafana | `http://<NODE_IP>:30300` |
| Prometheus | `http://<NODE_IP>:30090` |
| Alertmanager | `http://<NODE_IP>:30093` |

#### Option B — Port-forward (recommended for local clusters)

Run each command in a separate terminal tab:

```bash
# Grafana
kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3001:80

# Prometheus
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090

# Alertmanager
kubectl port-forward -n monitoring svc/kube-prometheus-stack-alertmanager 9093:9093
```

Then open:
- Grafana → [http://localhost:3001](http://localhost:3001)
- Prometheus → [http://localhost:9090](http://localhost:9090)
- Alertmanager → [http://localhost:9093](http://localhost:9093)

Log in to Grafana with `admin` / `<your-strong-password>`.

### 7. Import the Dashboard

The dashboard ConfigMap carries the label `grafana_dashboard: "1"`. The Grafana sidecar detects it automatically — the **Watermark App** dashboard appears under **Dashboards → Browse** within ~30 seconds of applying the ConfigMap.

For a manual import:
1. Open Grafana → **Dashboards → Import**
2. Paste the JSON content from `k8s/monitoring/grafana-dashboard-configmap.yaml`
3. Select the Prometheus datasource and click **Import**

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Returns `{ status: "ok" }` — used by Kubernetes startup, readiness, and liveness probes |
| `GET` | `/api/metrics` | Prometheus text-format metrics (scraped by ServiceMonitor) |
| `GET` | `/api/test-image` | Returns a sample image for development testing |

---

## Alerting Rules

Defined in `k8s/monitoring/alerts.yaml` as a `PrometheusRule` resource:

| Alert | Severity | Trigger condition |
|-------|----------|-------------------|
| `WatermarkAppPodNotReady` | critical | Any pod not ready for > 2 minutes |
| `WatermarkAppContainerRestarting` | warning | Container restart detected in the last 15 minutes |
| `WatermarkAppDeploymentUnavailable` | warning | Unavailable replicas for > 2 minutes |
| CPU threshold alerts | warning / critical | Configurable CPU usage thresholds |
| Memory threshold alerts | warning / critical | Configurable memory usage thresholds |

---

## Project Structure

```
.
├── app/                             # Next.js App Router
│   ├── page.tsx                     # Main UI page
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── health/route.ts          # GET /api/health
│       ├── metrics/route.ts         # GET /api/metrics  (Prometheus)
│       └── test-image/route.ts      # GET /api/test-image
├── components/
│   ├── ImageProcessor.tsx           # Core Jimp processing logic
│   ├── ProcessingControls.tsx       # Settings panel (method, blur, fill, opacity)
│   ├── UploadZone.tsx               # Drag-and-drop image upload
│   └── ResultPanel.tsx              # Before/after preview + download button
├── lib/
│   ├── metrics.ts                   # prom-client metric definitions
│   └── withMetrics.ts               # Route middleware for automatic metrics
├── k8s/
│   ├── app/
│   │   ├── namespace.yaml           # namespace: watermark-app
│   │   ├── deployment.yaml          # 5-replica Deployment with probes & resource limits
│   │   └── service.yaml             # NodePort :30080 → container :3000
│   └── monitoring/
│       ├── namespace.yaml           # namespace: monitoring
│       ├── helm-values.yaml         # kube-prometheus-stack Helm values
│       ├── grafana-secret.yaml      # Admin credentials secret (gitignored)
│       ├── servicemonitor.yaml      # Scrape config for /api/metrics every 15 s
│       ├── alerts.yaml              # PrometheusRule alerting rules
│       └── grafana-dashboard-configmap.yaml
├── Dockerfile                       # Multi-stage Node 20 Alpine build
├── next.config.ts                   # standalone output mode
└── package.json
```
