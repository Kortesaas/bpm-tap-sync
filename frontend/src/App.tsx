import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Slider, Stack, Typography } from "@mui/material";

type StateMsg = {
  type: "state";
  bpm: number;
  beat: number;
  bar: number;
  running: boolean;
};

type ErrorMsg = {
  type: "error";
  message: string;
};

type IncomingMsg = StateMsg | ErrorMsg;

type ControlMsg =
  | { type: "tap" }
  | { type: "set_bpm"; bpm: number }
  | { type: "nudge"; delta: number }
  | { type: "preset"; bpm: number };

function wsUrl() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

export default function App() {
  const [state, setState] = useState<StateMsg>({
    type: "state",
    bpm: 120,
    beat: 1,
    bar: 1,
    running: true
  });
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const presets = useMemo(() => [90, 100, 110, 120, 128, 140], []);

  useEffect(() => {
    let closedByApp = false;

    const connect = () => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (ev) => {
        let msg: IncomingMsg;
        try {
          msg = JSON.parse(ev.data) as IncomingMsg;
        } catch {
          return;
        }

        if (msg.type === "state") {
          setState(msg);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!closedByApp) {
          window.setTimeout(connect, 800);
        }
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      closedByApp = true;
      wsRef.current?.close();
    };
  }, []);

  const send = (obj: ControlMsg) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(obj));
  };

  const handleTap = () => send({ type: "tap" });

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        px: 2,
        pt: 2,
        pb: "calc(env(safe-area-inset-bottom) + 16px)",
        color: "#f6f8ff",
        background: "radial-gradient(circle at 20% 15%, #22325f 0%, #0e1424 45%, #090b12 100%)"
      }}
    >
      <Stack spacing={2.2} sx={{ width: "100%", maxWidth: 420, mx: "auto" }}>
        <Typography sx={{ textAlign: "center", opacity: 0.75, fontSize: 12, fontWeight: 700 }}>
          {connected ? "CONNECTED" : "RECONNECTING"}
        </Typography>

        <Typography
          component="h1"
          sx={{
            textAlign: "center",
            fontWeight: 900,
            letterSpacing: "0.02em",
            fontSize: "clamp(3.3rem, 18vw, 5.4rem)",
            lineHeight: 1
          }}
        >
          {state.bpm.toFixed(1)}
        </Typography>

        <Stack
          direction="row"
          spacing={0.7}
          sx={{
            p: 0.8,
            borderRadius: 99,
            bgcolor: "rgba(255,255,255,0.08)"
          }}
        >
          {[1, 2, 3, 4].map((b) => (
            <Box
              key={b}
              sx={{
                flex: 1,
                height: 10,
                borderRadius: 99,
                bgcolor: state.beat === b ? "#f9c74f" : "rgba(255,255,255,0.22)",
                boxShadow: state.beat === b ? "0 0 8px rgba(249,199,79,0.5)" : "none",
                opacity: state.beat === b ? 1 : 0.75,
                transition: "background-color 100ms linear, opacity 100ms linear, box-shadow 120ms linear"
              }}
            />
          ))}
        </Stack>

        <Button
          variant="contained"
          onPointerDown={handleTap}
          sx={{
            width: "100%",
            minHeight: 96,
            borderRadius: 4,
            fontSize: "1.8rem",
            fontWeight: 900,
            letterSpacing: "0.1em",
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
            userSelect: "none"
          }}
        >
          TAP
        </Button>

        <Box sx={{ px: 0.5 }}>
          <Slider
            min={60}
            max={200}
            step={0.1}
            value={state.bpm}
            valueLabelDisplay="auto"
            onChange={(_, value) =>
              send({ type: "set_bpm", bpm: Array.isArray(value) ? value[0] : value })
            }
            sx={{
              py: 1.4,
              "& .MuiSlider-thumb": {
                width: 26,
                height: 26
              },
              "& .MuiSlider-track, & .MuiSlider-rail": {
                height: 8,
                borderRadius: 8
              }
            }}
          />
        </Box>

        <Stack direction="row" spacing={1}>
          <Button
            fullWidth
            variant="outlined"
            onClick={() => send({ type: "nudge", delta: -1.0 })}
            sx={{ minHeight: 50, fontWeight: 700 }}
          >
            -1.0
          </Button>
          <Button
            fullWidth
            variant="outlined"
            onClick={() => send({ type: "nudge", delta: -0.1 })}
            sx={{ minHeight: 50, fontWeight: 700 }}
          >
            -0.1
          </Button>
          <Button
            fullWidth
            variant="outlined"
            onClick={() => send({ type: "nudge", delta: +0.1 })}
            sx={{ minHeight: 50, fontWeight: 700 }}
          >
            +0.1
          </Button>
          <Button
            fullWidth
            variant="outlined"
            onClick={() => send({ type: "nudge", delta: +1.0 })}
            sx={{ minHeight: 50, fontWeight: 700 }}
          >
            +1.0
          </Button>
        </Stack>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 1
          }}
        >
          {presets.map((bpm) => (
            <Button
              key={bpm}
              variant="outlined"
              onClick={() => send({ type: "preset", bpm })}
              sx={{ minHeight: 52, fontWeight: 800 }}
            >
              {bpm}
            </Button>
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
