import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, GlobalStyles, Slider, Stack, TextField, Typography } from "@mui/material";

type OutputName = "ma3" | "resolume" | "heavym";

type OutputSettings = {
  enabled: boolean;
  ip: string;
  port: number;
};

type HeavyMOscSettings = {
  bpm_address: string;
  resync_address: string;
  bpm_min: number;
  bpm_max: number;
  resync_value: number;
};

type StateMsg = {
  type: "state";
  bpm: number;
  beat: number;
  bar: number;
  running: boolean;
  metronome: boolean;
  round_whole_bpm: boolean;
};

type SettingsMsg = {
  type: "settings";
  round_whole_bpm: boolean;
  outputs: Record<OutputName, OutputSettings>;
  heavym_osc: HeavyMOscSettings;
};

type ErrorMsg = {
  type: "error";
  message: string;
};

type IncomingMsg = StateMsg | SettingsMsg | ErrorMsg;

type ControlMsg =
  | { type: "tap" }
  | { type: "set_bpm"; bpm: number }
  | { type: "nudge"; delta: number }
  | { type: "resync" }
  | { type: "toggle_metronome" }
  | { type: "set_round_whole_bpm"; enabled: boolean }
  | { type: "set_output_enabled"; target: OutputName; enabled: boolean }
  | { type: "set_output_target"; target: OutputName; ip: string; port: number }
  | {
      type: "set_heavym_osc";
      bpm_address: string;
      resync_address: string;
      bpm_min: number;
      bpm_max: number;
      resync_value: number;
    }
  | { type: "test_heavym_bpm"; bpm: number }
  | { type: "test_heavym_sync" }
  | { type: "get_settings" };

type ViewMode = "live" | "settings";

function wsUrl() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

const OUTPUT_LABELS: Record<OutputName, string> = {
  ma3: "MA3",
  resolume: "Resolume",
  heavym: "HeavyM"
};

const OUTPUT_ACCENTS: Record<OutputName, string> = {
  ma3: "#f2f6ff",
  resolume: "#6ee6a1",
  heavym: "#ffb66a"
};

export default function App() {
  const [view, setView] = useState<ViewMode>("live");
  const [state, setState] = useState<StateMsg>({
    type: "state",
    bpm: 120,
    beat: 1,
    bar: 1,
    running: true,
    metronome: false,
    round_whole_bpm: true
  });
  const [settings, setSettings] = useState<SettingsMsg>({
    type: "settings",
    round_whole_bpm: true,
    outputs: {
      ma3: { enabled: true, ip: "127.0.0.1", port: 8001 },
      resolume: { enabled: true, ip: "127.0.0.1", port: 7000 },
      heavym: { enabled: true, ip: "127.0.0.1", port: 9000 }
    },
    heavym_osc: {
      bpm_address: "/tempo/bpm",
      resync_address: "/tempo/resync",
      bpm_min: 20,
      bpm_max: 999,
      resync_value: 1
    }
  });
  const [tapPressed, setTapPressed] = useState(false);
  const [tapPulseId, setTapPulseId] = useState(0);
  const [resyncPressed, setResyncPressed] = useState(false);
  const [metroPressed, setMetroPressed] = useState(false);
  const [bpmEntry, setBpmEntry] = useState("120");
  const [connected, setConnected] = useState(false);

  const [outputDrafts, setOutputDrafts] = useState<Record<OutputName, { ip: string; port: string }>>({
    ma3: { ip: "127.0.0.1", port: "8001" },
    resolume: { ip: "127.0.0.1", port: "7000" },
    heavym: { ip: "127.0.0.1", port: "9000" }
  });
  const [heavymOscDraft, setHeavymOscDraft] = useState({
    bpmAddress: "/tempo/bpm",
    resyncAddress: "/tempo/resync",
    bpmMin: "20",
    bpmMax: "999",
    resyncValue: "1.0"
  });

  const wsRef = useRef<WebSocket | null>(null);
  const tapReleaseTimerRef = useRef<number | null>(null);
  const lastTapSentAtRef = useRef(0);
  const resyncReleaseTimerRef = useRef<number | null>(null);
  const metroReleaseTimerRef = useRef<number | null>(null);
  const entryDirtyRef = useRef(false);

  const nudgeButtons = useMemo(
    () =>
      settings.round_whole_bpm
        ? [
            { label: "-1", delta: -1.0 },
            { label: "+1", delta: 1.0 }
          ]
        : [
            { label: "-1", delta: -1.0 },
            { label: "-0.1", delta: -0.1 },
            { label: "+0.1", delta: 0.1 },
            { label: "+1", delta: 1.0 }
          ],
    [settings.round_whole_bpm]
  );

  useEffect(() => {
    let closedByApp = false;

    const connect = () => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify({ type: "get_settings" }));
      };

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
          return;
        }

        if (msg.type === "settings") {
          setSettings(msg);
          setOutputDrafts({
            ma3: { ip: msg.outputs.ma3.ip, port: String(msg.outputs.ma3.port) },
            resolume: { ip: msg.outputs.resolume.ip, port: String(msg.outputs.resolume.port) },
            heavym: { ip: msg.outputs.heavym.ip, port: String(msg.outputs.heavym.port) }
          });
          setHeavymOscDraft({
            bpmAddress: msg.heavym_osc.bpm_address,
            resyncAddress: msg.heavym_osc.resync_address,
            bpmMin: String(msg.heavym_osc.bpm_min),
            bpmMax: String(msg.heavym_osc.bpm_max),
            resyncValue: String(msg.heavym_osc.resync_value)
          });
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
      if (resyncReleaseTimerRef.current !== null) {
        window.clearTimeout(resyncReleaseTimerRef.current);
      }
      if (metroReleaseTimerRef.current !== null) {
        window.clearTimeout(metroReleaseTimerRef.current);
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

  const scheduleTapVisualRelease = (ms: number) => {
    if (tapReleaseTimerRef.current !== null) {
      window.clearTimeout(tapReleaseTimerRef.current);
    }
    tapReleaseTimerRef.current = window.setTimeout(() => {
      setTapPressed(false);
      tapReleaseTimerRef.current = null;
    }, ms);
  };

  const emitTap = () => {
    const now = performance.now();
    if (now - lastTapSentAtRef.current < 22) return;
    lastTapSentAtRef.current = now;
    send({ type: "tap" });
    setTapPulseId((prev) => prev + 1);
  };

  const handleTapDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore unsupported capture errors in older browsers.
    }
    setTapPressed(true);
    emitTap();
    scheduleTapVisualRelease(54);
  };

  const handleTapKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.repeat) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setTapPressed(true);
    emitTap();
    scheduleTapVisualRelease(54);
  };

  const triggerResync = () => {
    setResyncPressed(true);
    send({ type: "resync" });
    if (resyncReleaseTimerRef.current !== null) {
      window.clearTimeout(resyncReleaseTimerRef.current);
    }
    resyncReleaseTimerRef.current = window.setTimeout(() => {
      setResyncPressed(false);
      resyncReleaseTimerRef.current = null;
    }, 160);
  };

  const triggerMetroToggle = () => {
    setMetroPressed(true);
    send({ type: "toggle_metronome" });
    if (metroReleaseTimerRef.current !== null) {
      window.clearTimeout(metroReleaseTimerRef.current);
    }
    metroReleaseTimerRef.current = window.setTimeout(() => {
      setMetroPressed(false);
      metroReleaseTimerRef.current = null;
    }, 160);
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

  const toggleOutput = (target: OutputName) => {
    const current = settings.outputs[target].enabled;
    send({ type: "set_output_enabled", target, enabled: !current });
  };

  const updateDraft = (target: OutputName, field: "ip" | "port", value: string) => {
    setOutputDrafts((prev) => ({
      ...prev,
      [target]: { ...prev[target], [field]: value }
    }));
  };

  const applyOutputTarget = (target: OutputName) => {
    const draft = outputDrafts[target];
    const port = Number.parseInt(draft.port, 10);
    if (!draft.ip.trim() || Number.isNaN(port)) return;
    send({
      type: "set_output_target",
      target,
      ip: draft.ip.trim(),
      port
    });
  };

  const updateHeavymOscDraft = (
    field: "bpmAddress" | "resyncAddress" | "bpmMin" | "bpmMax" | "resyncValue",
    value: string
  ) => {
    setHeavymOscDraft((prev) => ({ ...prev, [field]: value }));
  };

  const applyHeavymOsc = () => {
    const bpmAddress = heavymOscDraft.bpmAddress.trim();
    const resyncAddress = heavymOscDraft.resyncAddress.trim();
    const bpmMin = Number.parseFloat(heavymOscDraft.bpmMin);
    const bpmMax = Number.parseFloat(heavymOscDraft.bpmMax);
    const resyncValue = Number.parseFloat(heavymOscDraft.resyncValue);
    if (!bpmAddress || !resyncAddress || Number.isNaN(bpmMin) || Number.isNaN(bpmMax) || Number.isNaN(resyncValue)) return;
    if (bpmMax <= bpmMin) return;
    send({
      type: "set_heavym_osc",
      bpm_address: bpmAddress,
      resync_address: resyncAddress,
      bpm_min: bpmMin,
      bpm_max: bpmMax,
      resync_value: resyncValue
    });
  };

  const sendHeavymTestBpm = () => {
    send({ type: "test_heavym_bpm", bpm: state.bpm });
  };

  const sendHeavymTestSync = () => {
    send({ type: "test_heavym_sync" });
  };

  return (
    <>
      <GlobalStyles
        styles={{
          "*, *::before, *::after": { boxSizing: "border-box" },
          "html, body, #root": {
            width: "100%",
            height: "100%",
            margin: 0,
            padding: 0,
            overflow: "hidden"
          },
          body: { background: "#0f1117" }
        }}
      />

      <Box
        sx={{
          position: "fixed",
          inset: 0,
          overflow: "hidden",
          display: "flex",
          justifyContent: "center",
          alignItems: "stretch",
          px: "max(8px, env(safe-area-inset-left))",
          pr: "max(8px, env(safe-area-inset-right))",
          pt: "max(8px, env(safe-area-inset-top))",
          pb: "max(8px, env(safe-area-inset-bottom))",
          background: "linear-gradient(180deg, #161b25 0%, #0d1018 100%)",
          color: "#f0f4ff",
          fontFamily: "'Space Grotesk', 'Segoe UI', sans-serif"
        }}
      >
        <Stack
          spacing={0.9}
          sx={{
            "--desktop-content-scale": "1",
            width: "100%",
            height: "100%",
            minWidth: 0,
            p: 1,
            borderRadius: 2.4,
            background: "#161c27",
            border: "1px solid #2e3647",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
            "@media (min-width: 1024px) and (pointer: fine)": {
              "--desktop-content-scale": "clamp(0.78, calc((100dvh - 24px) / 940), 1)",
              width: "min(520px, calc((100dvh - 24px) * 11 / 19.5))",
              height: "auto",
              aspectRatio: "11 / 19.5",
              maxHeight: "calc(100dvh - 24px)"
            }
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.85, fontWeight: 700 }}>
              BPM CONTROL
            </Typography>
            <Stack direction="row" spacing={0.6} alignItems="center">
              <Box
                sx={{
                  px: 0.7,
                  py: 0.2,
                  borderRadius: 99,
                  display: "flex",
                  alignItems: "center",
                  gap: 0.6,
                  border: "1px solid #3c4558",
                  bgcolor: "#111723"
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: connected ? "#36d77e" : "#ff6961",
                    boxShadow: connected ? "0 0 8px #36d77e" : "0 0 8px #ff6961"
                  }}
                />
                <Typography sx={{ fontSize: 10, opacity: 0.9, fontWeight: 700 }}>
                  {connected ? "ONLINE" : "OFFLINE"}
                </Typography>
              </Box>
              <Button
                variant={view === "settings" ? "contained" : "outlined"}
                onClick={() => setView((prev) => (prev === "settings" ? "live" : "settings"))}
                sx={{
                  minWidth: 34,
                  width: 34,
                  height: 34,
                  p: 0,
                  borderRadius: 1,
                  borderColor: "#4a5469",
                  bgcolor: view === "settings" ? "#6a58e5" : "#111723",
                  "&:hover": { bgcolor: view === "settings" ? "#5d4dcc" : "#171f2d" }
                }}
              >
                <Box sx={{ width: 16, display: "grid", gap: 0.35 }}>
                  <Box sx={{ height: 2, borderRadius: 2, bgcolor: "#e5ecff", width: "100%" }} />
                  <Box sx={{ height: 2, borderRadius: 2, bgcolor: "#e5ecff", width: "72%", justifySelf: "end" }} />
                  <Box sx={{ height: 2, borderRadius: 2, bgcolor: "#e5ecff", width: "86%" }} />
                </Box>
              </Button>
            </Stack>
          </Stack>

          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
              "@media (min-width: 1024px) and (pointer: fine)": {
                overflowY: "auto",
                overflowX: "hidden",
                scrollbarWidth: "none",
                "&::-webkit-scrollbar": {
                  width: 0,
                  height: 0
                }
              }
            }}
          >
            <Box
              sx={{
                width: "100%",
                "@media (min-width: 1024px) and (pointer: fine)": {
                  transform: "scale(var(--desktop-content-scale))",
                  transformOrigin: "top center",
                  width: "calc(100% / var(--desktop-content-scale))"
                }
              }}
            >
              {view === "live" ? (
                <Stack spacing={0.9} sx={{ minWidth: 0, pb: 0.4 }}>
                <Typography
                  component="h1"
                  sx={{
                    textAlign: "center",
                    fontWeight: 800,
                    fontSize: "clamp(2.6rem, 13vw, 4.6rem)",
                    lineHeight: 1,
                    letterSpacing: "0.02em"
                  }}
                >
                  {settings.round_whole_bpm ? state.bpm.toFixed(0) : state.bpm.toFixed(1)}
                </Typography>

                <Stack
                  direction="row"
                  spacing={0.5}
                  sx={{
                    p: 0.45,
                    borderRadius: 1.1,
                    bgcolor: "#0f141f",
                    border: "1px solid #2a3140"
                  }}
                >
                  {[1, 2, 3, 4].map((b) => (
                    <Box
                      key={b}
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        height: 8,
                        borderRadius: 1,
                        bgcolor: state.beat === b ? "#52b8ff" : "#2d3444",
                        transition: "background-color 80ms linear"
                      }}
                    />
                  ))}
                </Stack>

                <Box sx={{ display: "flex", justifyContent: "center", py: 0.2 }}>
                  <Box
                    component="button"
                    type="button"
                    onPointerDown={handleTapDown}
                    onKeyDown={handleTapKeyDown}
                    onPointerUp={releaseTapVisual}
                    onPointerLeave={releaseTapVisual}
                    onPointerCancel={releaseTapVisual}
                    sx={{
                      position: "relative",
                      overflow: "hidden",
                      width: "min(56vw, 200px)",
                      aspectRatio: "1 / 1",
                      border: "none",
                      borderRadius: 2,
                      cursor: "pointer",
                      color: "#ffffff",
                      fontSize: "1.8rem",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      touchAction: "manipulation",
                      WebkitTapHighlightColor: "transparent",
                      userSelect: "none",
                      background: tapPressed ? "#2591ff" : "#3478f6",
                      boxShadow: tapPressed
                        ? "inset 0 0 0 2px #b5dbff, 0 1px 10px rgba(37,145,255,0.42)"
                        : "inset 0 0 0 1px rgba(255,255,255,0.18), 0 8px 20px rgba(0,0,0,0.32)",
                      transform: tapPressed ? "scale(0.976)" : "scale(1)",
                      transition: "transform 24ms linear, background-color 42ms linear, box-shadow 42ms linear",
                      "@keyframes tapPulseRing": {
                        "0%": { transform: "scale(0.88)", opacity: 0.55 },
                        "100%": { transform: "scale(1.08)", opacity: 0 }
                      },
                      willChange: "transform, background-color, box-shadow"
                    }}
                  >
                    <Box
                      key={tapPulseId}
                      sx={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "inherit",
                        border: "2px solid rgba(215,237,255,0.82)",
                        pointerEvents: "none",
                        animation: "tapPulseRing 190ms ease-out"
                      }}
                    />
                    TAP
                  </Box>
                </Box>

                <Slider
                  min={60}
                  max={200}
                  step={settings.round_whole_bpm ? 1 : 0.1}
                  value={state.bpm}
                  valueLabelDisplay="auto"
                  onChange={(_, value) =>
                    send({ type: "set_bpm", bpm: Array.isArray(value) ? value[0] : value })
                  }
                  sx={{
                    py: 0.5,
                    color: "#67c3ff",
                    "& .MuiSlider-thumb": { width: 22, height: 22 },
                    "& .MuiSlider-track, & .MuiSlider-rail": { height: 6, borderRadius: 8 }
                  }}
                />

                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 0.7 }}>
                  <Button
                    variant={resyncPressed ? "contained" : "outlined"}
                    onClick={triggerResync}
                    sx={{
                      minHeight: 78,
                      minWidth: 0,
                      fontWeight: 800,
                      borderColor: "#4a5469",
                      color: "#e5ecff",
                      bgcolor: resyncPressed ? "#3478f6" : "transparent",
                      "&:hover": { bgcolor: resyncPressed ? "#2c68d6" : "rgba(255,255,255,0.04)" }
                    }}
                  >
                    RESYNC
                  </Button>
                  <Button
                    variant={metroPressed ? "contained" : "outlined"}
                    onClick={triggerMetroToggle}
                    sx={{
                      minHeight: 78,
                      minWidth: 0,
                      fontWeight: 800,
                      borderColor: "#4a5469",
                      color: "#e5ecff",
                      bgcolor: metroPressed ? "#18a367" : "transparent",
                      "&:hover": { bgcolor: metroPressed ? "#168d5a" : "rgba(255,255,255,0.04)" }
                    }}
                  >
                    METRO TOGGLE
                  </Button>
                </Box>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${nudgeButtons.length + 2}, minmax(0, 1fr))`,
                    gap: 0.7
                  }}
                >
                  <Button
                    variant="outlined"
                    onClick={() => send({ type: "set_bpm", bpm: state.bpm / 2 })}
                    sx={{ minHeight: 40, minWidth: 0, fontWeight: 700, borderColor: "#4a5469", color: "#e5ecff" }}
                  >
                    /2
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => send({ type: "set_bpm", bpm: state.bpm * 2 })}
                    sx={{ minHeight: 40, minWidth: 0, fontWeight: 700, borderColor: "#4a5469", color: "#e5ecff" }}
                  >
                    *2
                  </Button>
                  {nudgeButtons.map((item) => (
                    <Button
                      key={item.label}
                      variant="outlined"
                      onClick={() => send({ type: "nudge", delta: item.delta })}
                      sx={{ minHeight: 40, minWidth: 0, fontWeight: 700, borderColor: "#4a5469", color: "#e5ecff" }}
                    >
                      {item.label}
                    </Button>
                  ))}
                </Box>

                <Box sx={{ mt: "auto", minWidth: 0 }}>
                  <Typography sx={{ fontSize: 10, letterSpacing: "0.08em", opacity: 0.75, mb: 0.5 }}>
                    DIRECT BPM INPUT
                  </Typography>

                  <Box
                    sx={{
                      minHeight: 42,
                      px: 1,
                      mb: 0.7,
                      borderRadius: 1.3,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      bgcolor: "#111b2a",
                      border: "1px solid #4b5a79",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)"
                    }}
                  >
                    <Typography sx={{ fontSize: 22, fontWeight: 800 }}>{bpmEntry || "---"}</Typography>
                    <Typography sx={{ fontSize: 11, opacity: 0.7 }}>BPM</Typography>
                  </Box>

                  <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 0.7 }}>
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                      <Button
                        key={digit}
                        variant="outlined"
                        onPointerDown={() => appendDigit(digit)}
                        sx={{
                          minHeight: 48,
                          minWidth: 0,
                          fontSize: "1.06rem",
                          fontWeight: 900,
                          borderColor: "#6d81a8",
                          color: "#ffffff",
                          bgcolor: "#1a2334",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                          "&:hover": { bgcolor: "#1f2b40" }
                        }}
                      >
                        {digit}
                      </Button>
                    ))}
                    <Button
                      variant="outlined"
                      onPointerDown={clearEntry}
                      sx={{
                        minHeight: 48,
                        minWidth: 0,
                        fontWeight: 800,
                        borderColor: "#6d81a8",
                        color: "#ffffff",
                        bgcolor: "#1a2334",
                        "&:hover": { bgcolor: "#1f2b40" }
                      }}
                    >
                      CLR
                    </Button>
                    <Button
                      variant="outlined"
                      onPointerDown={() => appendDigit("0")}
                      sx={{
                        minHeight: 48,
                        minWidth: 0,
                        fontSize: "1.06rem",
                        fontWeight: 900,
                        borderColor: "#6d81a8",
                        color: "#ffffff",
                        bgcolor: "#1a2334",
                        "&:hover": { bgcolor: "#1f2b40" }
                      }}
                    >
                      0
                    </Button>
                    <Button
                      variant="outlined"
                      onPointerDown={backspaceEntry}
                      sx={{
                        minHeight: 48,
                        minWidth: 0,
                        fontWeight: 800,
                        borderColor: "#6d81a8",
                        color: "#ffffff",
                        bgcolor: "#1a2334",
                        "&:hover": { bgcolor: "#1f2b40" }
                      }}
                    >
                      DEL
                    </Button>
                    <Button
                      variant="contained"
                      onPointerDown={applyEntry}
                      sx={{
                        minHeight: 50,
                        minWidth: 0,
                        fontWeight: 900,
                        fontSize: "0.98rem",
                        letterSpacing: "0.03em",
                        gridColumn: "1 / -1",
                        bgcolor: "#3478f6"
                      }}
                    >
                      SET BPM
                    </Button>
                  </Box>
                </Box>
                </Stack>
              ) : (
                <Stack spacing={1.2} sx={{ minWidth: 0, pb: 0.4 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", opacity: 0.85 }}>
                  SETTINGS
                </Typography>
                <Box
                  sx={{
                    p: 1.05,
                    borderRadius: 1.7,
                    bgcolor: "#101723",
                    border: "1px solid #2f3a4f",
                    boxShadow: "0 8px 18px rgba(0,0,0,0.22)"
                  }}
                >
                  <Typography sx={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.75, mb: 0.8 }}>
                    TEMPO DISPLAY
                  </Typography>
                  <Button
                    fullWidth
                    variant={settings.round_whole_bpm ? "contained" : "outlined"}
                    onClick={() =>
                      send({
                        type: "set_round_whole_bpm",
                        enabled: !settings.round_whole_bpm
                      })
                    }
                    sx={{
                      minHeight: 44,
                      fontWeight: 800,
                      color: "#f2f6ff",
                      bgcolor: settings.round_whole_bpm ? "#6a58e5" : "#2a3650",
                      border: "1px solid #54688e",
                      boxShadow: "0 7px 16px rgba(0,0,0,0.24)",
                      "&:hover": { bgcolor: settings.round_whole_bpm ? "#5d4dcc" : "#324263" },
                      "&:active": { transform: "translateY(1px)" }
                    }}
                  >
                    ROUND BPM {settings.round_whole_bpm ? "ON" : "OFF"}
                  </Button>
                </Box>

                {(Object.keys(settings.outputs) as OutputName[]).map((target) => {
                  const cfg = settings.outputs[target];
                  const draft = outputDrafts[target];
                  const accent = OUTPUT_ACCENTS[target];
                  return (
                    <Box
                      key={target}
                      sx={{
                        p: 1.15,
                        borderRadius: 1.8,
                        bgcolor: "#101723",
                        border: "1px solid #2f3a4f",
                        boxShadow: "0 10px 22px rgba(0,0,0,0.24)",
                        minWidth: 0,
                        position: "relative",
                        overflow: "hidden",
                        "&::before": {
                          content: '""',
                          position: "absolute",
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: 4,
                          bgcolor: accent
                        }
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.95 }}>
                        <Typography sx={{ fontWeight: 900, letterSpacing: "0.02em" }}>{OUTPUT_LABELS[target]}</Typography>
                        <Box
                          sx={{
                            px: 0.8,
                            py: 0.22,
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 900,
                            letterSpacing: "0.03em",
                            color: cfg.enabled ? "#5ef19d" : "#ff9d9d",
                            bgcolor: cfg.enabled ? "rgba(94,241,157,0.12)" : "rgba(255,157,157,0.12)",
                            border: `1px solid ${cfg.enabled ? "rgba(94,241,157,0.35)" : "rgba(255,157,157,0.35)"}`
                          }}
                        >
                          {cfg.enabled ? "ACTIVE" : "DISABLED"}
                        </Box>
                      </Stack>

                      <Stack direction="row" spacing={0.8} sx={{ minWidth: 0 }}>
                        <TextField
                          label="IP"
                          value={draft.ip}
                          onChange={(e) => updateDraft(target, "ip", e.target.value)}
                          size="small"
                          fullWidth
                          sx={{
                            minWidth: 0,
                            "& .MuiInputBase-input": { color: "#f0f4ff" },
                            "& .MuiInputLabel-root": { color: "#9aabcf" },
                            "& .MuiOutlinedInput-root fieldset": { borderColor: "#4a5469" }
                          }}
                        />
                        <TextField
                          label="Port"
                          value={draft.port}
                          onChange={(e) => updateDraft(target, "port", e.target.value)}
                          size="small"
                          sx={{
                            width: 110,
                            minWidth: 90,
                            "& .MuiInputBase-input": { color: "#f0f4ff" },
                            "& .MuiInputLabel-root": { color: "#9aabcf" },
                            "& .MuiOutlinedInput-root fieldset": { borderColor: "#4a5469" }
                          }}
                        />
                      </Stack>

                      <Button
                        fullWidth
                        variant="contained"
                        onClick={() => applyOutputTarget(target)}
                        sx={{
                          minHeight: 41,
                          mt: 0.9,
                          fontWeight: 900,
                          letterSpacing: "0.02em",
                          color: "#f1f6ff",
                          bgcolor: "#2d4062",
                          border: "1px solid #5671a0",
                          boxShadow: "0 6px 14px rgba(0,0,0,0.24)",
                          "&:hover": { bgcolor: "#35507a" },
                          "&:active": { transform: "translateY(1px)" }
                        }}
                      >
                        SAVE {OUTPUT_LABELS[target]} TARGET
                      </Button>

                      {target === "heavym" ? (
                        <Box
                          sx={{
                            mt: 0.95,
                            p: 0.85,
                            borderRadius: 1.3,
                            bgcolor: "#0d141f",
                            border: "1px solid #2f3a4f"
                          }}
                        >
                          <Typography sx={{ fontSize: 10, letterSpacing: "0.08em", opacity: 0.75, mb: 0.8 }}>
                            HEAVYM OSC MAPPING
                          </Typography>
                          <Stack spacing={0.8} sx={{ minWidth: 0 }}>
                            <TextField
                              label="BPM Address"
                              value={heavymOscDraft.bpmAddress}
                              onChange={(e) => updateHeavymOscDraft("bpmAddress", e.target.value)}
                              size="small"
                              fullWidth
                              sx={{
                                minWidth: 0,
                                "& .MuiInputBase-input": { color: "#f0f4ff" },
                                "& .MuiInputLabel-root": { color: "#9aabcf" },
                                "& .MuiOutlinedInput-root fieldset": { borderColor: "#4a5469" }
                              }}
                            />
                            <TextField
                              label="Resync Address"
                              value={heavymOscDraft.resyncAddress}
                              onChange={(e) => updateHeavymOscDraft("resyncAddress", e.target.value)}
                              size="small"
                              fullWidth
                              sx={{
                                minWidth: 0,
                                "& .MuiInputBase-input": { color: "#f0f4ff" },
                                "& .MuiInputLabel-root": { color: "#9aabcf" },
                                "& .MuiOutlinedInput-root fieldset": { borderColor: "#4a5469" }
                              }}
                            />
                            <Stack direction="row" spacing={0.8}>
                              <TextField
                                label="BPM Min"
                                value={heavymOscDraft.bpmMin}
                                onChange={(e) => updateHeavymOscDraft("bpmMin", e.target.value)}
                                size="small"
                                fullWidth
                                sx={{
                                  minWidth: 0,
                                  "& .MuiInputBase-input": { color: "#f0f4ff" },
                                  "& .MuiInputLabel-root": { color: "#9aabcf" },
                                  "& .MuiOutlinedInput-root fieldset": { borderColor: "#4a5469" }
                                }}
                              />
                              <TextField
                                label="BPM Max"
                                value={heavymOscDraft.bpmMax}
                                onChange={(e) => updateHeavymOscDraft("bpmMax", e.target.value)}
                                size="small"
                                fullWidth
                                sx={{
                                  minWidth: 0,
                                  "& .MuiInputBase-input": { color: "#f0f4ff" },
                                  "& .MuiInputLabel-root": { color: "#9aabcf" },
                                  "& .MuiOutlinedInput-root fieldset": { borderColor: "#4a5469" }
                                }}
                              />
                            </Stack>
                            <TextField
                              label="Resync Value"
                              value={heavymOscDraft.resyncValue}
                              onChange={(e) => updateHeavymOscDraft("resyncValue", e.target.value)}
                              size="small"
                              fullWidth
                              sx={{
                                minWidth: 0,
                                "& .MuiInputBase-input": { color: "#f0f4ff" },
                                "& .MuiInputLabel-root": { color: "#9aabcf" },
                                "& .MuiOutlinedInput-root fieldset": { borderColor: "#4a5469" }
                              }}
                            />
                            <Stack direction="row" spacing={0.8}>
                              <Button
                                fullWidth
                                variant="contained"
                                onClick={sendHeavymTestBpm}
                                sx={{
                                  minHeight: 41,
                                  fontWeight: 900,
                                  letterSpacing: "0.02em",
                                  color: "#f1f6ff",
                                  bgcolor: "#2d4062",
                                  border: "1px solid #5671a0",
                                  boxShadow: "0 6px 14px rgba(0,0,0,0.24)",
                                  "&:hover": { bgcolor: "#35507a" },
                                  "&:active": { transform: "translateY(1px)" }
                                }}
                              >
                                TEST BPM MSG
                              </Button>
                              <Button
                                fullWidth
                                variant="contained"
                                onClick={sendHeavymTestSync}
                                sx={{
                                  minHeight: 41,
                                  fontWeight: 900,
                                  letterSpacing: "0.02em",
                                  color: "#f1f6ff",
                                  bgcolor: "#2d4062",
                                  border: "1px solid #5671a0",
                                  boxShadow: "0 6px 14px rgba(0,0,0,0.24)",
                                  "&:hover": { bgcolor: "#35507a" },
                                  "&:active": { transform: "translateY(1px)" }
                                }}
                              >
                                TEST SYNC MSG
                              </Button>
                            </Stack>
                            <Button
                              fullWidth
                              variant="contained"
                              onClick={applyHeavymOsc}
                              sx={{
                                minHeight: 41,
                                fontWeight: 900,
                                letterSpacing: "0.02em",
                                color: "#f1f6ff",
                                bgcolor: "#2d4062",
                                border: "1px solid #5671a0",
                                boxShadow: "0 6px 14px rgba(0,0,0,0.24)",
                                "&:hover": { bgcolor: "#35507a" },
                                "&:active": { transform: "translateY(1px)" }
                              }}
                            >
                              SAVE HEAVYM OSC
                            </Button>
                          </Stack>
                        </Box>
                      ) : null}

                      <Button
                        fullWidth
                        variant="contained"
                        onClick={() => toggleOutput(target)}
                        sx={{
                          minHeight: 44,
                          mt: 1.05,
                          fontWeight: 900,
                          letterSpacing: "0.03em",
                          color: "#f8fbff",
                          bgcolor: cfg.enabled ? "#cf334a" : "#1c9b66",
                          border: `1px solid ${cfg.enabled ? "#de5d70" : "#46bf8b"}`,
                          boxShadow: cfg.enabled
                            ? "0 8px 16px rgba(207,51,74,0.3)"
                            : "0 8px 16px rgba(28,155,102,0.25)",
                          "&:hover": { bgcolor: cfg.enabled ? "#b92d42" : "#188355" },
                          "&:active": { transform: "translateY(1px)" }
                        }}
                      >
                        {cfg.enabled ? "DEACTIVATE" : "ACTIVATE"}
                      </Button>
                    </Box>
                  );
                })}
                </Stack>
              )}
            </Box>
          </Box>
        </Stack>
      </Box>
    </>
  );
}
