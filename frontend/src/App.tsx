import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Stack, Typography, Slider } from "@mui/material";

type StateMsg = {
  type: "state";
  bpm: number;
  beat: number;
  bar: number;
  running: boolean;
};

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

  const wsRef = useRef<WebSocket | null>(null);
  const presets = useMemo(() => [90, 100, 110, 120, 128, 140], []);

  useEffect(() => {
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as StateMsg;
      if (msg.type === "state") setState(msg);
    };

    ws.onclose = () => {
      // minimal reconnect: reload page
      setTimeout(() => window.location.reload(), 800);
    };

    return () => ws.close();
  }, []);

  const send = (obj: any) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(obj));
  };

  return (
    <Box sx={{ minHeight: "100vh", p: 3, bgcolor: "#111", color: "#fff" }}>
      <Stack spacing={3} sx={{ maxWidth: 520, mx: "auto" }}>
        <Typography variant="h2" sx={{ fontWeight: 800, textAlign: "center" }}>
          {state.bpm.toFixed(1)}
        </Typography>

        <Typography variant="body1" sx={{ textAlign: "center", opacity: 0.8 }}>
          Beat {state.beat} · Bar {state.bar}
        </Typography>

        <Box
          sx={{
            height: 16,
            borderRadius: 99,
            bgcolor: state.beat === 1 ? "#4aa3ff" : "#2a2a2a",
            transition: "background-color 80ms linear"
          }}
        />

        <Button
          size="large"
          variant="contained"
          onClick={() => send({ type: "tap" })}
          sx={{ py: 2, fontSize: 22, fontWeight: 700 }}
        >
          TAP
        </Button>

        <Slider
          min={60}
          max={200}
          step={0.1}
          value={state.bpm}
          onChange={(_, v) => send({ type: "set_bpm", bpm: v })}
        />

        <Stack direction="row" spacing={1} justifyContent="center">
          <Button variant="outlined" onClick={() => send({ type: "nudge", delta: -0.1 })}>
            -0.1
          </Button>
          <Button variant="outlined" onClick={() => send({ type: "nudge", delta: +0.1 })}>
            +0.1
          </Button>
          <Button variant="outlined" onClick={() => send({ type: "nudge", delta: -1.0 })}>
            -1
          </Button>
          <Button variant="outlined" onClick={() => send({ type: "nudge", delta: +1.0 })}>
            +1
          </Button>
        </Stack>

        <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap">
          {presets.map((p) => (
            <Button key={p} variant="outlined" onClick={() => send({ type: "preset", bpm: p })}>
              {p}
            </Button>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}
