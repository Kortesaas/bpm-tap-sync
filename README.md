# BPM Tap Sync

`bpm-tap-sync` is a live tempo control tool for show environments.  
It lets you tap in BPM, nudge timing, and broadcast synced tempo/resync OSC messages to:

- `grandMA onPC3`
- `Resolume Arena`
- `HeavyM Pro+`

The app has:

- A React touchscreen-style frontend
- A FastAPI backend with WebSocket control/state sync
- OSC output routing and per-target configuration

## What This Project Is For

Use this when you need one control surface to keep multiple visual/lighting systems in tempo during rehearsals or live operation.

Typical workflow:

1. Tap the beat in the web UI
2. Fine-adjust BPM with nudge controls
3. Push synced tempo to MA3 / Resolume / HeavyM
4. Trigger resync when needed

## Main Features

- Tap-tempo engine with smoothing and outlier rejection
- BPM range clamping (`20` to `300` in engine)
- Optional whole-number BPM rounding (`1.0` step) or decimal mode (`0.1` step)
- OSC target enable/disable per output
- Live IP/port reconfiguration for each output
- MA3 routing:
  - primary speed master (default `3.16`)
  - optional extra masters with multipliers (`0.5x`, `1x`, `2x`)
- HeavyM mapping:
  - configurable BPM OSC address
  - configurable resync OSC address
  - configurable BPM normalization min/max and resync value
  - test BPM and test sync send buttons
- Resolume support:
  - tempo (normalized `0.0..1.0`)
  - resync trigger
  - metronome toggle
- Multiple UI skins + performance mode toggle
- Auto-reconnect frontend WebSocket behavior

## Tech Stack

- Frontend: React + TypeScript + Vite + MUI
- Backend: FastAPI + Uvicorn + Python
- OSC: `python-osc`

## Project Structure

```text
bpm-tap-sync/
|-- build_and_run.ps1
|-- frontend/
|   |-- src/
|   `-- package.json
`-- backend/
    |-- main.py
    |-- requirements.txt
    `-- src/bpm_tap_sync/
        |-- engine.py
        |-- osc.py
        `-- config.py
```

## Prerequisites

- Windows PowerShell (for `build_and_run.ps1`)
- Python `3.10+` (3.11 recommended)
- Node.js `18+` and npm

## Installation

### 1) Clone and enter project

```powershell
git clone <your-repo-url>
cd bpm-tap-sync
```

### 2) Install backend dependencies

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ..
```

### 3) Install frontend dependencies

```powershell
cd frontend
npm install
cd ..
```

## Run (Build + Start) Using Your Script

From project root:

```powershell
.\build_and_run.ps1
```

What this script does:

1. Builds frontend (`frontend/dist`)
2. Replaces backend static folder (`backend/frontend_dist`)
3. Activates backend virtual environment
4. Starts backend via `python main.py`

After startup, open:

- `http://localhost:8000` (app served by FastAPI)
- `http://localhost:8000/docs` (FastAPI docs)

## Development Mode (Frontend + Backend Separately)

Use this when actively editing UI/backend.

### Terminal 1: Backend

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python main.py
```

### Terminal 2: Frontend

```powershell
cd frontend
npm run dev
```

Open `http://localhost:5173`.

Vite is configured to proxy:

- `/api` -> `http://localhost:8000`
- `/ws` -> `ws://localhost:8000`

## Configuration

Backend settings are read from environment variables with prefix `BPM_TAP_SYNC_`.  
A `.env` file is supported (typically place it in `backend/.env` because backend is run from that folder).

### Available environment variables

| Variable | Default | Description |
|---|---|---|
| `BPM_TAP_SYNC_HOST` | `0.0.0.0` | Backend bind host |
| `BPM_TAP_SYNC_PORT` | `8000` | Backend HTTP port |
| `BPM_TAP_SYNC_MA3_IP` | `127.0.0.1` | MA3 OSC target IP |
| `BPM_TAP_SYNC_MA3_PORT` | `8001` | MA3 OSC target port |
| `BPM_TAP_SYNC_MA3_BPM_MASTER` | `3.16` | MA3 primary speed master |
| `BPM_TAP_SYNC_RESOLUME_IP` | `127.0.0.1` | Resolume OSC target IP |
| `BPM_TAP_SYNC_RESOLUME_PORT` | `7000` | Resolume OSC target port |
| `BPM_TAP_SYNC_HEAVYM_IP` | `127.0.0.1` | HeavyM OSC target IP |
| `BPM_TAP_SYNC_HEAVYM_PORT` | `9000` | HeavyM OSC target port |
| `BPM_TAP_SYNC_HEAVYM_BPM_ADDRESS` | `/tempo/bpm` | HeavyM BPM OSC address |
| `BPM_TAP_SYNC_HEAVYM_RESYNC_ADDRESS` | `/tempo/resync` | HeavyM resync OSC address |
| `BPM_TAP_SYNC_HEAVYM_BPM_MIN` | `20.0` | HeavyM normalization min BPM |
| `BPM_TAP_SYNC_HEAVYM_BPM_MAX` | `999.0` | HeavyM normalization max BPM |
| `BPM_TAP_SYNC_HEAVYM_RESYNC_VALUE` | `1.0` | HeavyM resync payload value |
| `BPM_TAP_SYNC_HEAVYM_RESYNC_SEND_ZERO` | `False` | Send trailing `0.0` after resync |

### Example `backend/.env`

```env
BPM_TAP_SYNC_HOST=0.0.0.0
BPM_TAP_SYNC_PORT=8000

BPM_TAP_SYNC_MA3_IP=192.168.0.50
BPM_TAP_SYNC_MA3_PORT=8001
BPM_TAP_SYNC_MA3_BPM_MASTER=3.16

BPM_TAP_SYNC_RESOLUME_IP=192.168.0.60
BPM_TAP_SYNC_RESOLUME_PORT=7000

BPM_TAP_SYNC_HEAVYM_IP=192.168.0.70
BPM_TAP_SYNC_HEAVYM_PORT=9000
BPM_TAP_SYNC_HEAVYM_BPM_ADDRESS=/tempo/bpm
BPM_TAP_SYNC_HEAVYM_RESYNC_ADDRESS=/tempo/resync
BPM_TAP_SYNC_HEAVYM_BPM_MIN=20
BPM_TAP_SYNC_HEAVYM_BPM_MAX=999
BPM_TAP_SYNC_HEAVYM_RESYNC_VALUE=1
BPM_TAP_SYNC_HEAVYM_RESYNC_SEND_ZERO=false
```

## API / Realtime Interface

- Health: `GET /api/health`
- Realtime control/state: WebSocket `GET /ws`

The frontend sends control messages (tap, BPM set, nudge, output settings, etc.) over `/ws`, and backend broadcasts state/settings updates.

## Notes About OSC Behavior

- MA3 BPM is sent as `/cmd` command strings
- Resolume tempo is normalized to `0.0..1.0` (mapped from BPM range `20..500`)
- HeavyM BPM is normalized to `0.0..1.0` using configured min/max
- Resync action:
  - triggers Resolume resync
  - triggers HeavyM resync
  - pushes current BPM to MA3

## Troubleshooting

- PowerShell blocks script execution:
  - run PowerShell as user and set policy if needed:
  - `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
- `.\.venv\Scripts\Activate.ps1` fails in script:
  - create backend venv first (`python -m venv backend\.venv`)
- `npm` / `python` command not found:
  - verify Node.js and Python are installed and in `PATH`
- App opens but no OSC effect:
  - verify target IP/port in Settings view
  - ensure output is `ACTIVE`
  - check target software OSC input config/firewall/network
- Port already in use:
  - change `BPM_TAP_SYNC_PORT` or stop the process using that port
