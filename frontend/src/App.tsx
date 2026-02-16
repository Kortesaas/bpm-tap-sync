import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, GlobalStyles, Slider, Stack, TextField, Typography } from "@mui/material";

type OutputName = "ma3" | "resolume" | "heavym";

type OutputSettings = {
  enabled: boolean;
  ip: string;
  port: number;
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
    }
  });
  const [tapPressed, setTapPressed] = useState(false);
  const [bpmEntry, setBpmEntry] = useState("120");
  const [connected, setConnected] = useState(false);

  const [outputDrafts, setOutputDrafts] = useState<Record<OutputName, { ip: string; port: string }>>({
    ma3: { ip: "127.0.0.1", port: "8001" },
    resolume: { ip: "127.0.0.1", port: "7000" },
    heavym: { ip: "127.0.0.1", port: "9000" }
  });

  const wsRef = useRef<WebSocket | null>(null);
  const tapReleaseTimerRef = useRef<number | null>(null);
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
    }, 55);
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
            width: "100%",
            height: "100%",
            minWidth: 0,
            p: 1,
            borderRadius: 2.4,
            background: "#161c27",
            border: "1px solid #2e3647",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)"
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.85, fontWeight: 700 }}>
              BPM CONTROL
            </Typography>
            <Stack direction="row" spacing={0.6} alignItems="center">
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: connected ? "#36d77e" : "#ff6961",
                  boxShadow: connected ? "0 0 8px #36d77e" : "0 0 8px #ff6961"
                }}
              />
              <Typography sx={{ fontSize: 11, opacity: 0.85, fontWeight: 700 }}>
                {connected ? "CONNECTED" : "OFFLINE"}
              </Typography>
            </Stack>
          </Stack>

          <Stack direction="row" spacing={0.7}>
            <Button
              fullWidth
              variant={view === "live" ? "contained" : "outlined"}
              onClick={() => setView("live")}
              sx={{ minHeight: 36, fontWeight: 800 }}
            >
              LIVE
            </Button>
            <Button
              fullWidth
              variant={view === "settings" ? "contained" : "outlined"}
              onClick={() => setView("settings")}
              sx={{ minHeight: 36, fontWeight: 800 }}
            >
              SETTINGS
            </Button>
          </Stack>

          <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
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
                    onPointerUp={releaseTapVisual}
                    onPointerLeave={releaseTapVisual}
                    onPointerCancel={releaseTapVisual}
                    sx={{
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
                        ? "inset 0 0 0 2px #94c9ff, 0 1px 8px rgba(37,145,255,0.35)"
                        : "inset 0 0 0 1px rgba(255,255,255,0.15), 0 8px 20px rgba(0,0,0,0.32)",
                      transform: tapPressed ? "scale(0.985)" : "scale(1)",
                      transition: "transform 35ms linear, background-color 55ms linear, box-shadow 55ms linear"
                    }}
                  >
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
                    variant="outlined"
                    onClick={() => send({ type: "resync" })}
                    sx={{ minHeight: 40, minWidth: 0, fontWeight: 700, borderColor: "#4a5469", color: "#e5ecff" }}
                  >
                    RESYNC
                  </Button>
                  <Button
                    variant={state.metronome ? "contained" : "outlined"}
                    onClick={() => send({ type: "toggle_metronome" })}
                    sx={{
                      minHeight: 40,
                      minWidth: 0,
                      fontWeight: 700,
                      borderColor: "#4a5469",
                      color: state.metronome ? "#ffffff" : "#e5ecff",
                      bgcolor: state.metronome ? "#18a367" : "transparent",
                      "&:hover": { bgcolor: state.metronome ? "#168d5a" : "rgba(255,255,255,0.04)" }
                    }}
                  >
                    METRO {state.metronome ? "ON" : "OFF"}
                  </Button>
                </Box>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${nudgeButtons.length}, minmax(0, 1fr))`,
                    gap: 0.7
                  }}
                >
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
                      minHeight: 38,
                      px: 1,
                      mb: 0.7,
                      borderRadius: 1.3,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      bgcolor: "#0f141f",
                      border: "1px solid #2a3140"
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
                        sx={{ minHeight: 42, minWidth: 0, fontSize: "1rem", fontWeight: 800, borderColor: "#4a5469", color: "#f1f5ff" }}
                      >
                        {digit}
                      </Button>
                    ))}
                    <Button variant="outlined" onPointerDown={clearEntry} sx={{ minHeight: 42, minWidth: 0, fontWeight: 700, borderColor: "#4a5469", color: "#f1f5ff" }}>
                      CLR
                    </Button>
                    <Button variant="outlined" onPointerDown={() => appendDigit("0")} sx={{ minHeight: 42, minWidth: 0, fontSize: "1rem", fontWeight: 800, borderColor: "#4a5469", color: "#f1f5ff" }}>
                      0
                    </Button>
                    <Button variant="outlined" onPointerDown={backspaceEntry} sx={{ minHeight: 42, minWidth: 0, fontWeight: 700, borderColor: "#4a5469", color: "#f1f5ff" }}>
                      DEL
                    </Button>
                    <Button
                      variant="contained"
                      onPointerDown={applyEntry}
                      sx={{ minHeight: 44, minWidth: 0, fontWeight: 800, gridColumn: "1 / -1", bgcolor: "#3478f6" }}
                    >
                      SET BPM
                    </Button>
                  </Box>
                </Box>
              </Stack>
            ) : (
              <Stack spacing={1.1} sx={{ minWidth: 0, pb: 0.4 }}>
                <Box
                  sx={{
                    p: 1,
                    borderRadius: 1.4,
                    bgcolor: "#0f141f",
                    border: "1px solid #2a3140"
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
                      minHeight: 42,
                      fontWeight: 800,
                      bgcolor: settings.round_whole_bpm ? "#6a58e5" : "transparent"
                    }}
                  >
                    ROUND BPM {settings.round_whole_bpm ? "ON" : "OFF"}
                  </Button>
                </Box>

                {(Object.keys(settings.outputs) as OutputName[]).map((target) => {
                  const cfg = settings.outputs[target];
                  const draft = outputDrafts[target];
                  return (
                    <Box
                      key={target}
                      sx={{
                        p: 1,
                        borderRadius: 1.4,
                        bgcolor: "#0f141f",
                        border: "1px solid #2a3140",
                        minWidth: 0
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.8 }}>
                        <Typography sx={{ fontWeight: 800 }}>{OUTPUT_LABELS[target]}</Typography>
                        <Typography sx={{ fontSize: 12, fontWeight: 800, color: cfg.enabled ? "#4ae28f" : "#ff8a8a" }}>
                          {cfg.enabled ? "ACTIVE" : "DISABLED"}
                        </Typography>
                      </Stack>

                      <Button
                        fullWidth
                        variant={cfg.enabled ? "contained" : "outlined"}
                        onClick={() => toggleOutput(target)}
                        sx={{
                          minHeight: 40,
                          mb: 0.8,
                          fontWeight: 800,
                          bgcolor: cfg.enabled ? "#18a367" : "transparent",
                          "&:hover": { bgcolor: cfg.enabled ? "#168d5a" : "rgba(255,255,255,0.04)" }
                        }}
                      >
                        {cfg.enabled ? "DEACTIVATE" : "ACTIVATE"}
                      </Button>

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
                        variant="outlined"
                        onClick={() => applyOutputTarget(target)}
                        sx={{ minHeight: 40, mt: 0.8, fontWeight: 800, borderColor: "#4a5469", color: "#e5ecff" }}
                      >
                        SAVE {OUTPUT_LABELS[target]} TARGET
                      </Button>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Box>
        </Stack>
      </Box>
    </>
  );
}
