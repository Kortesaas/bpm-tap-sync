import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Slider, Stack, Typography } from "@mui/material";

type StateMsg = {
  type: "state";
  bpm: number;
  beat: number;
  bar: number;
  running: boolean;
  metronome: boolean;
  round_whole_bpm: boolean;
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
  | { type: "preset"; bpm: number }
  | { type: "resync" }
  | { type: "toggle_metronome" }
  | { type: "toggle_bpm_rounding" };

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
    running: true,
    metronome: false,
    round_whole_bpm: true
  });
  const [connected, setConnected] = useState(false);
  const [tapPressed, setTapPressed] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const tapReleaseTimerRef = useRef<number | null>(null);
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
      if (tapReleaseTimerRef.current !== null) {
        window.clearTimeout(tapReleaseTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, []);

  const send = (obj: ControlMsg) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(obj));
  };

  const handleTapDown = () => {
    setTapPressed(true);
    send({ type: "tap" });
    if (tapReleaseTimerRef.current !== null) {
      window.clearTimeout(tapReleaseTimerRef.current);
    }
    tapReleaseTimerRef.current = window.setTimeout(() => {
      setTapPressed(false);
      tapReleaseTimerRef.current = null;
    }, 90);
  };

  const nudgeButtons = state.round_whole_bpm
    ? [
        { label: "-1", delta: -1.0 },
        { label: "+1", delta: 1.0 }
      ]
    : [
        { label: "-1", delta: -1.0 },
        { label: "-0.1", delta: -0.1 },
        { label: "+0.1", delta: 0.1 },
        { label: "+1", delta: 1.0 }
      ];

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        px: 1.6,
        pt: 1.6,
        pb: "calc(env(safe-area-inset-bottom) + 14px)",
        color: "#d7e1ff",
        fontFamily: "'IBM Plex Mono', 'JetBrains Mono', 'Consolas', monospace",
        backgroundColor: "#080d17",
        backgroundImage:
          "radial-gradient(80% 60% at 50% 0%, rgba(49,86,158,0.30) 0%, rgba(8,13,23,0) 100%), linear-gradient(rgba(66,98,166,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(66,98,166,0.14) 1px, transparent 1px)",
        backgroundSize: "100% 100%, 22px 22px, 22px 22px"
      }}
    >
      <Stack
        spacing={1.5}
        sx={{
          width: "100%",
          maxWidth: 420,
          mx: "auto",
          p: 1.2,
          borderRadius: 4,
          border: "1px solid rgba(120,150,210,0.28)",
          background: "rgba(7,11,20,0.72)",
          backdropFilter: "blur(8px)"
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography sx={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.7 }}>
            BPM TAP SYNC
          </Typography>
          <Typography sx={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.85 }}>
            {connected ? "LINK OK" : "RECONNECT"}
          </Typography>
        </Stack>

        <Typography
          component="h1"
          sx={{
            textAlign: "center",
            fontWeight: 900,
            fontSize: "clamp(3.1rem, 15vw, 5rem)",
            lineHeight: 1,
            letterSpacing: "0.03em",
            textShadow: "0 0 14px rgba(101,178,255,0.35)"
          }}
        >
          {state.round_whole_bpm ? state.bpm.toFixed(0) : state.bpm.toFixed(1)}
        </Typography>

        <Stack
          direction="row"
          spacing={0.55}
          sx={{
            p: 0.55,
            borderRadius: 1.3,
            border: "1px solid rgba(121,165,234,0.24)",
            bgcolor: "rgba(115,138,177,0.08)"
          }}
        >
          {[1, 2, 3, 4].map((b) => (
            <Box
              key={b}
              sx={{
                flex: 1,
                height: 9,
                borderRadius: 1,
                bgcolor: state.beat === b ? "#7fd7ff" : "rgba(168,190,227,0.20)",
                boxShadow: state.beat === b ? "0 0 9px rgba(127,215,255,0.55)" : "none",
                transition: "background-color 80ms linear, box-shadow 100ms linear"
              }}
            />
          ))}
        </Stack>

        <Box sx={{ display: "flex", justifyContent: "center", py: 0.6 }}>
          <Box
            component="button"
            type="button"
            onPointerDown={handleTapDown}
            sx={{
              width: "min(74vw, 270px)",
              aspectRatio: "1 / 1",
              border: "none",
              borderRadius: 3,
              cursor: "pointer",
              color: "#dff2ff",
              fontSize: "2.1rem",
              fontWeight: 900,
              letterSpacing: "0.12em",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              userSelect: "none",
              background: tapPressed
                ? "linear-gradient(135deg, #5ea9ff 0%, #3e7ed1 100%)"
                : "linear-gradient(135deg, #4d8be0 0%, #305f9f 100%)",
              boxShadow: tapPressed
                ? "0 0 0 2px rgba(148,214,255,0.6), 0 3px 18px rgba(84,158,255,0.55)"
                : "0 0 0 1px rgba(132,190,255,0.35), 0 8px 26px rgba(58,116,194,0.45)",
              transform: tapPressed ? "scale(0.985)" : "scale(1)",
              transition: "transform 40ms linear, box-shadow 60ms linear, background 60ms linear"
            }}
          >
            TAP
          </Box>
        </Box>

        <Box sx={{ px: 0.3 }}>
          <Slider
            min={60}
            max={200}
            step={state.round_whole_bpm ? 1 : 0.1}
            value={state.bpm}
            valueLabelDisplay="auto"
            onChange={(_, value) =>
              send({ type: "set_bpm", bpm: Array.isArray(value) ? value[0] : value })
            }
            sx={{
              py: 1.1,
              color: "#83d3ff",
              "& .MuiSlider-thumb": {
                width: 24,
                height: 24,
                boxShadow: "0 0 0 4px rgba(131,211,255,0.2)"
              },
              "& .MuiSlider-track, & .MuiSlider-rail": {
                height: 8,
                borderRadius: 8
              }
            }}
          />
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 0.9
          }}
        >
          <Button
            variant="outlined"
            onClick={() => send({ type: "resync" })}
            sx={{ minHeight: 48, fontWeight: 800, fontSize: "0.83rem" }}
          >
            RESYNC
          </Button>
          <Button
            variant="outlined"
            onClick={() => send({ type: "toggle_metronome" })}
            sx={{ minHeight: 48, fontWeight: 800, fontSize: "0.83rem" }}
          >
            METRO TOGGLE
          </Button>
          <Button
            variant={state.round_whole_bpm ? "contained" : "outlined"}
            onClick={() => send({ type: "toggle_bpm_rounding" })}
            sx={{ minHeight: 48, fontWeight: 800, fontSize: "0.83rem", gridColumn: "1 / -1" }}
          >
            ROUND BPM
          </Button>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `repeat(${nudgeButtons.length}, minmax(0, 1fr))`,
            gap: 0.9
          }}
        >
          {nudgeButtons.map((item) => (
            <Button
              key={item.label}
              variant="outlined"
              onClick={() => send({ type: "nudge", delta: item.delta })}
              sx={{ minHeight: 48, fontWeight: 800 }}
            >
              {item.label}
            </Button>
          ))}
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 0.9
          }}
        >
          {presets.map((bpm) => (
            <Button
              key={bpm}
              variant="outlined"
              onClick={() => send({ type: "preset", bpm })}
              sx={{ minHeight: 50, fontWeight: 900 }}
            >
              {bpm}
            </Button>
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
