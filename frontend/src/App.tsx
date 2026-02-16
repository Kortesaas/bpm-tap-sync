import React, { useEffect, useRef, useState } from "react";
import { Box, Button, GlobalStyles, Slider, Stack, Typography } from "@mui/material";

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
  const [bpmEntry, setBpmEntry] = useState("120");

  const wsRef = useRef<WebSocket | null>(null);
  const tapReleaseTimerRef = useRef<number | null>(null);
  const entryDirtyRef = useRef(false);

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
          if (!entryDirtyRef.current) {
            setBpmEntry(String(Math.round(msg.bpm)));
          }
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

  const releaseTapVisual = () => {
    if (tapReleaseTimerRef.current !== null) {
      window.clearTimeout(tapReleaseTimerRef.current);
      tapReleaseTimerRef.current = null;
    }
    setTapPressed(false);
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
    }, 60);
  };

  const setEntryFromDigits = (nextRaw: string) => {
    const stripped = nextRaw.replace(/^0+(?=\d)/, "");
    setBpmEntry(stripped.slice(0, 3));
  };

  const appendDigit = (digit: string) => {
    const base = entryDirtyRef.current ? bpmEntry : "";
    setEntryFromDigits(`${base}${digit}`);
    entryDirtyRef.current = true;
  };

  const clearEntry = () => {
    setBpmEntry("");
    entryDirtyRef.current = true;
  };

  const backspaceEntry = () => {
    setBpmEntry((prev) => prev.slice(0, -1));
    entryDirtyRef.current = true;
  };

  const applyEntry = () => {
    const parsed = Number.parseInt(bpmEntry, 10);
    if (Number.isNaN(parsed)) return;
    send({ type: "set_bpm", bpm: parsed });
    entryDirtyRef.current = false;
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
    <>
      <GlobalStyles
        styles={{
          "html, body, #root": {
            width: "100%",
            height: "100%",
            margin: 0,
            padding: 0,
            overflow: "hidden"
          },
          body: {
            backgroundColor: "#080d17"
          }
        }}
      />

      <Box
        sx={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100dvh",
          overflow: "hidden",
          px: "max(8px, env(safe-area-inset-left))",
          pt: "max(8px, env(safe-area-inset-top))",
          pb: "max(8px, env(safe-area-inset-bottom))",
          pr: "max(8px, env(safe-area-inset-right))",
          color: "#d7e1ff",
          fontFamily: "'IBM Plex Mono', 'JetBrains Mono', 'Consolas', monospace",
          backgroundColor: "#080d17",
          backgroundImage:
            "radial-gradient(80% 60% at 50% 0%, rgba(49,86,158,0.30) 0%, rgba(8,13,23,0) 100%), linear-gradient(rgba(66,98,166,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(66,98,166,0.14) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 22px 22px, 22px 22px"
        }}
      >
        <Stack
          spacing={1}
          sx={{
            height: "100%",
            width: "100%",
            p: 1.1,
            borderRadius: 3,
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
              fontSize: "clamp(2.8rem, 14vw, 4.8rem)",
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
              p: 0.45,
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
                  height: 8,
                  borderRadius: 1,
                  bgcolor: state.beat === b ? "#7fd7ff" : "rgba(168,190,227,0.20)",
                  boxShadow: state.beat === b ? "0 0 9px rgba(127,215,255,0.55)" : "none",
                  transition: "background-color 80ms linear, box-shadow 100ms linear"
                }}
              />
            ))}
          </Stack>

          <Box sx={{ display: "flex", justifyContent: "center", py: 0.35 }}>
            <Box
              component="button"
              type="button"
              onPointerDown={handleTapDown}
              onPointerUp={releaseTapVisual}
              onPointerLeave={releaseTapVisual}
              onPointerCancel={releaseTapVisual}
              sx={{
                width: "min(58vw, 230px)",
                aspectRatio: "1 / 1",
                border: "none",
                borderRadius: 2.5,
                cursor: "pointer",
                color: "#dff2ff",
                fontSize: "1.85rem",
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
                  : "0 0 0 1px rgba(132,190,255,0.35), 0 8px 24px rgba(58,116,194,0.42)",
                transform: tapPressed ? "scale(0.985)" : "scale(1)",
                transition: "transform 35ms linear, box-shadow 60ms linear, background 60ms linear"
              }}
            >
              TAP
            </Box>
          </Box>

          <Box sx={{ px: 0.2 }}>
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
                py: 0.8,
                color: "#83d3ff",
                "& .MuiSlider-thumb": {
                  width: 22,
                  height: 22,
                  boxShadow: "0 0 0 4px rgba(131,211,255,0.2)"
                },
                "& .MuiSlider-track, & .MuiSlider-rail": {
                  height: 7,
                  borderRadius: 8
                }
              }}
            />
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 0.8
            }}
          >
            <Button
              variant="outlined"
              onClick={() => send({ type: "resync" })}
              sx={{ minHeight: 42, fontWeight: 800, fontSize: "0.8rem" }}
            >
              RESYNC
            </Button>
            <Button
              variant="outlined"
              onClick={() => send({ type: "toggle_metronome" })}
              sx={{ minHeight: 42, fontWeight: 800, fontSize: "0.8rem" }}
            >
              METRO TOGGLE
            </Button>
            <Button
              variant={state.round_whole_bpm ? "contained" : "outlined"}
              onClick={() => send({ type: "toggle_bpm_rounding" })}
              sx={{ minHeight: 42, fontWeight: 800, fontSize: "0.8rem", gridColumn: "1 / -1" }}
            >
              ROUND BPM
            </Button>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: `repeat(${nudgeButtons.length}, minmax(0, 1fr))`,
              gap: 0.8
            }}
          >
            {nudgeButtons.map((item) => (
              <Button
                key={item.label}
                variant="outlined"
                onClick={() => send({ type: "nudge", delta: item.delta })}
                sx={{ minHeight: 42, fontWeight: 800 }}
              >
                {item.label}
              </Button>
            ))}
          </Box>

          <Stack spacing={0.6} sx={{ mt: "auto" }}>
            <Typography sx={{ fontSize: 11, opacity: 0.8, letterSpacing: "0.08em" }}>
              CUSTOM BPM INPUT
            </Typography>
            <Box
              sx={{
                minHeight: 42,
                px: 1.2,
                borderRadius: 1.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                border: "1px solid rgba(121,165,234,0.24)",
                bgcolor: "rgba(115,138,177,0.08)"
              }}
            >
              <Typography sx={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.08em" }}>
                {bpmEntry || "---"}
              </Typography>
              <Typography sx={{ fontSize: 11, opacity: 0.7 }}>BPM</Typography>
            </Box>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 0.75
              }}
            >
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                <Button
                  key={digit}
                  variant="outlined"
                  onPointerDown={() => appendDigit(digit)}
                  sx={{ minHeight: 44, fontWeight: 900, fontSize: "1rem" }}
                >
                  {digit}
                </Button>
              ))}
              <Button variant="outlined" onPointerDown={clearEntry} sx={{ minHeight: 44, fontWeight: 800 }}>
                CLR
              </Button>
              <Button variant="outlined" onPointerDown={() => appendDigit("0")} sx={{ minHeight: 44, fontWeight: 900, fontSize: "1rem" }}>
                0
              </Button>
              <Button variant="outlined" onPointerDown={backspaceEntry} sx={{ minHeight: 44, fontWeight: 800 }}>
                DEL
              </Button>
              <Button
                variant="contained"
                onPointerDown={applyEntry}
                sx={{ minHeight: 46, fontWeight: 900, gridColumn: "1 / -1" }}
              >
                SET BPM
              </Button>
            </Box>
          </Stack>
        </Stack>
      </Box>
    </>
  );
}
