import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, GlobalStyles, Slider, Stack, TextField, Typography } from "@mui/material";

type OutputName = "ma3" | "resolume" | "heavym";

type OutputSettings = {
  enabled: boolean;
  ip: string;
  port: number;
};

type Ma3OscExtra = {
  master: string;
  multiplier: number;
};

type Ma3OscSettings = {
  primary_master: string;
  extras: Ma3OscExtra[];
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
  ma3_osc: Ma3OscSettings;
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
  | { type: "set_ma3_osc"; primary_master: string; extras: Ma3OscExtra[] }
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
type SkinName = "tech" | "pink" | "ice" | "black_dark" | "black_light" | "white_dark" | "white_light";

type SkinPalette = {
  label: string;
  bodyBg: string;
  shellGradient: string;
  panelBg: string;
  panelBorder: string;
  cardBg: string;
  cardBorder: string;
  insetBg: string;
  insetBorder: string;
  text: string;
  textMuted: string;
  iconButtonBg: string;
  iconButtonBorder: string;
  iconButtonActiveBg: string;
  iconButtonHoverBg: string;
  liveAccent: string;
  liveAccentStrong: string;
  beatOff: string;
  buttonSurface: string;
  buttonSurfaceBorder: string;
  buttonSurfaceHover: string;
  buttonPrimary: string;
  buttonPrimaryHover: string;
  tapIdle: string;
  tapPressed: string;
  tapGlow: string;
  slider: string;
  deactivate: string;
  deactivateBorder: string;
  deactivateHover: string;
  activate: string;
  activateBorder: string;
  activateHover: string;
  outputAccents: Record<OutputName, string>;
};

function wsUrl() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

const OUTPUT_LABELS: Record<OutputName, string> = {
  ma3: "MA3",
  resolume: "Resolume",
  heavym: "HeavyM"
};

const SKIN_STORAGE_KEY = "bpm-tap-sync:skin";
const PERFORMANCE_MODE_STORAGE_KEY = "bpm-tap-sync:performance-mode";

const SKINS: Record<SkinName, SkinPalette> = {
  tech: {
    label: "Tech Blue",
    bodyBg: "#0f1117",
    shellGradient: "linear-gradient(180deg, #161b25 0%, #0d1018 100%)",
    panelBg: "#161c27",
    panelBorder: "#2e3647",
    cardBg: "#101723",
    cardBorder: "#2f3a4f",
    insetBg: "#0d141f",
    insetBorder: "#2f3a4f",
    text: "#f0f4ff",
    textMuted: "#9aabcf",
    iconButtonBg: "#111723",
    iconButtonBorder: "#4a5469",
    iconButtonActiveBg: "#6a58e5",
    iconButtonHoverBg: "#171f2d",
    liveAccent: "#52b8ff",
    liveAccentStrong: "#67c3ff",
    beatOff: "#2d3444",
    buttonSurface: "#1a2334",
    buttonSurfaceBorder: "#6d81a8",
    buttonSurfaceHover: "#1f2b40",
    buttonPrimary: "#2d4062",
    buttonPrimaryHover: "#35507a",
    tapIdle: "#67c3ff",
    tapPressed: "#67c3ff",
    tapGlow: "#d8f0ff",
    slider: "#67c3ff",
    deactivate: "#cf334a",
    deactivateBorder: "#de5d70",
    deactivateHover: "#b92d42",
    activate: "#1c9b66",
    activateBorder: "#46bf8b",
    activateHover: "#188355",
    outputAccents: {
      ma3: "#f2f6ff",
      resolume: "#ffb66a",
      heavym: "#6ee6a1"
    }
  },
  pink: {
    label: "Neon Pink",
    bodyBg: "#160d19",
    shellGradient: "linear-gradient(180deg, #2b102a 0%, #170d1e 100%)",
    panelBg: "#27142c",
    panelBorder: "#5b2f63",
    cardBg: "#220f2a",
    cardBorder: "#5b2f63",
    insetBg: "#1a0d22",
    insetBorder: "#5b2f63",
    text: "#ffeefb",
    textMuted: "#e3afd6",
    iconButtonBg: "#211128",
    iconButtonBorder: "#a84da8",
    iconButtonActiveBg: "#d34db2",
    iconButtonHoverBg: "#2a1431",
    liveAccent: "#ff8cd7",
    liveAccentStrong: "#ff4fb8",
    beatOff: "#503050",
    buttonSurface: "#3a1f43",
    buttonSurfaceBorder: "#c86fb5",
    buttonSurfaceHover: "#47254f",
    buttonPrimary: "#8e3e89",
    buttonPrimaryHover: "#a3499c",
    tapIdle: "#ff4fb8",
    tapPressed: "#ff3ea7",
    tapGlow: "#ffd1ef",
    slider: "#ff7ccc",
    deactivate: "#cf334a",
    deactivateBorder: "#de5d70",
    deactivateHover: "#b92d42",
    activate: "#b3459c",
    activateBorder: "#cc73b8",
    activateHover: "#9d3d89",
    outputAccents: {
      ma3: "#ffffff",
      resolume: "#6ee6a1",
      heavym: "#ffb66a"
    }
  },
  ice: {
    label: "Ice Mint",
    bodyBg: "#091519",
    shellGradient: "linear-gradient(180deg, #0f2128 0%, #081217 100%)",
    panelBg: "#102028",
    panelBorder: "#2c5a63",
    cardBg: "#0d1a22",
    cardBorder: "#2d5b64",
    insetBg: "#0a141b",
    insetBorder: "#2d5b64",
    text: "#e7f9ff",
    textMuted: "#9bcdd8",
    iconButtonBg: "#0e1a22",
    iconButtonBorder: "#467886",
    iconButtonActiveBg: "#3fa5bc",
    iconButtonHoverBg: "#12212a",
    liveAccent: "#71e7ff",
    liveAccentStrong: "#3fcde8",
    beatOff: "#2a4650",
    buttonSurface: "#15303a",
    buttonSurfaceBorder: "#4d95a5",
    buttonSurfaceHover: "#1a3a45",
    buttonPrimary: "#2d7180",
    buttonPrimaryHover: "#368698",
    tapIdle: "#3fcde8",
    tapPressed: "#31bad5",
    tapGlow: "#bdf5ff",
    slider: "#71e7ff",
    deactivate: "#bf4a5f",
    deactivateBorder: "#d57686",
    deactivateHover: "#aa4054",
    activate: "#2d7180",
    activateBorder: "#4d95a5",
    activateHover: "#368698",
    outputAccents: {
      ma3: "#ffffff",
      resolume: "#ffb66a",
      heavym: "#6ee6a1"
    }
  },
  black_dark: {
    label: "Black Dark",
    bodyBg: "#050505",
    shellGradient: "linear-gradient(180deg, #101010 0%, #060606 100%)",
    panelBg: "#121212",
    panelBorder: "#2f2f2f",
    cardBg: "#171717",
    cardBorder: "#343434",
    insetBg: "#0d0d0d",
    insetBorder: "#303030",
    text: "#f5f5f5",
    textMuted: "#b6b6b6",
    iconButtonBg: "#111111",
    iconButtonBorder: "#4a4a4a",
    iconButtonActiveBg: "#6c6c6c",
    iconButtonHoverBg: "#1b1b1b",
    liveAccent: "#f0f0f0",
    liveAccentStrong: "#cfcfcf",
    beatOff: "#2b2b2b",
    buttonSurface: "#1b1b1b",
    buttonSurfaceBorder: "#5a5a5a",
    buttonSurfaceHover: "#242424",
    buttonPrimary: "#333333",
    buttonPrimaryHover: "#414141",
    tapIdle: "#3f3f3f",
    tapPressed: "#565656",
    tapGlow: "#f3f3f3",
    slider: "#e7e7e7",
    deactivate: "#cf334a",
    deactivateBorder: "#de5d70",
    deactivateHover: "#b92d42",
    activate: "#4e4e4e",
    activateBorder: "#6d6d6d",
    activateHover: "#5b5b5b",
    outputAccents: {
      ma3: "#ffffff",
      resolume: "#dcdcdc",
      heavym: "#a9a9a9"
    }
  },
  black_light: {
    label: "Black Light",
    bodyBg: "#dcdcdc",
    shellGradient: "linear-gradient(180deg, #f6f6f6 0%, #e3e3e3 100%)",
    panelBg: "#fdfdfd",
    panelBorder: "#b5b5b5",
    cardBg: "#f6f6f6",
    cardBorder: "#bbbbbb",
    insetBg: "#efefef",
    insetBorder: "#b3b3b3",
    text: "#101010",
    textMuted: "#5a5a5a",
    iconButtonBg: "#f4f4f4",
    iconButtonBorder: "#6f6f6f",
    iconButtonActiveBg: "#4a4a4a",
    iconButtonHoverBg: "#e9e9e9",
    liveAccent: "#2f2f2f",
    liveAccentStrong: "#202020",
    beatOff: "#cfcfcf",
    buttonSurface: "#f0f0f0",
    buttonSurfaceBorder: "#7b7b7b",
    buttonSurfaceHover: "#e4e4e4",
    buttonPrimary: "#d9d9d9",
    buttonPrimaryHover: "#cccccc",
    tapIdle: "#3d3d3d",
    tapPressed: "#2a2a2a",
    tapGlow: "#ffffff",
    slider: "#1f1f1f",
    deactivate: "#cf334a",
    deactivateBorder: "#de5d70",
    deactivateHover: "#b92d42",
    activate: "#2e2e2e",
    activateBorder: "#5c5c5c",
    activateHover: "#202020",
    outputAccents: {
      ma3: "#1a1a1a",
      resolume: "#2f2f2f",
      heavym: "#5a5a5a"
    }
  },
  white_dark: {
    label: "White Dark",
    bodyBg: "#0a0a0a",
    shellGradient: "linear-gradient(180deg, #1b1b1b 0%, #0d0d0d 100%)",
    panelBg: "#171717",
    panelBorder: "#4d4d4d",
    cardBg: "#1d1d1d",
    cardBorder: "#4f4f4f",
    insetBg: "#121212",
    insetBorder: "#474747",
    text: "#ffffff",
    textMuted: "#cdcdcd",
    iconButtonBg: "#171717",
    iconButtonBorder: "#686868",
    iconButtonActiveBg: "#f0f0f0",
    iconButtonHoverBg: "#222222",
    liveAccent: "#ffffff",
    liveAccentStrong: "#f2f2f2",
    beatOff: "#353535",
    buttonSurface: "#242424",
    buttonSurfaceBorder: "#7d7d7d",
    buttonSurfaceHover: "#2d2d2d",
    buttonPrimary: "#3a3a3a",
    buttonPrimaryHover: "#4a4a4a",
    tapIdle: "#4d4d4d",
    tapPressed: "#636363",
    tapGlow: "#ffffff",
    slider: "#ffffff",
    deactivate: "#cf334a",
    deactivateBorder: "#de5d70",
    deactivateHover: "#b92d42",
    activate: "#e8e8e8",
    activateBorder: "#ffffff",
    activateHover: "#cfcfcf",
    outputAccents: {
      ma3: "#ffffff",
      resolume: "#e8e8e8",
      heavym: "#bfbfbf"
    }
  },
  white_light: {
    label: "White Light",
    bodyBg: "#efefef",
    shellGradient: "linear-gradient(180deg, #ffffff 0%, #f1f1f1 100%)",
    panelBg: "#ffffff",
    panelBorder: "#cdcdcd",
    cardBg: "#fafafa",
    cardBorder: "#d0d0d0",
    insetBg: "#f3f3f3",
    insetBorder: "#c8c8c8",
    text: "#111111",
    textMuted: "#666666",
    iconButtonBg: "#f9f9f9",
    iconButtonBorder: "#7a7a7a",
    iconButtonActiveBg: "#1f1f1f",
    iconButtonHoverBg: "#eeeeee",
    liveAccent: "#181818",
    liveAccentStrong: "#111111",
    beatOff: "#dddddd",
    buttonSurface: "#f5f5f5",
    buttonSurfaceBorder: "#8a8a8a",
    buttonSurfaceHover: "#ebebeb",
    buttonPrimary: "#e5e5e5",
    buttonPrimaryHover: "#dadada",
    tapIdle: "#181818",
    tapPressed: "#050505",
    tapGlow: "#ffffff",
    slider: "#101010",
    deactivate: "#cf334a",
    deactivateBorder: "#de5d70",
    deactivateHover: "#b92d42",
    activate: "#1d1d1d",
    activateBorder: "#555555",
    activateHover: "#090909",
    outputAccents: {
      ma3: "#151515",
      resolume: "#323232",
      heavym: "#666666"
    }
  }
};

const SKIN_CHOICES: SkinName[] = ["tech", "pink", "ice", "black_dark", "black_light", "white_dark", "white_light"];

const MA3_EXTRA_MASTERS = Array.from({ length: 15 }, (_, i) => `3.${i + 1}`);

export default function App() {
  const [view, setView] = useState<ViewMode>("live");
  const [skinName, setSkinName] = useState<SkinName>(() => {
    try {
      const stored = localStorage.getItem(SKIN_STORAGE_KEY);
      if (stored && stored in SKINS) return stored as SkinName;
    } catch {
      // Ignore storage access issues.
    }
    return "tech";
  });
  const [performanceMode, setPerformanceMode] = useState(() => {
    try {
      return localStorage.getItem(PERFORMANCE_MODE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
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
    ma3_osc: {
      primary_master: "3.16",
      extras: []
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
  const [ma3ExtraDraft, setMa3ExtraDraft] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(MA3_EXTRA_MASTERS.map((master) => [master, null]))
  );
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
  const skin = SKINS[skinName];
  const activeButtonText = skinName === "black_light" || skinName === "white_light" ? "#f7f7f7" : skin.text;
  const tapButtonText = skinName === "black_light" || skinName === "white_light" ? "#ffffff" : skin.text;

  useEffect(() => {
    try {
      localStorage.setItem(SKIN_STORAGE_KEY, skinName);
    } catch {
      // Ignore storage access issues.
    }
  }, [skinName]);

  useEffect(() => {
    try {
      localStorage.setItem(PERFORMANCE_MODE_STORAGE_KEY, performanceMode ? "1" : "0");
    } catch {
      // Ignore storage access issues.
    }
  }, [performanceMode]);

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
          const nextMa3Draft = Object.fromEntries(MA3_EXTRA_MASTERS.map((master) => [master, null])) as Record<
            string,
            number | null
          >;
          for (const item of msg.ma3_osc.extras) {
            if (item.master in nextMa3Draft) {
              nextMa3Draft[item.master] = item.multiplier;
            }
          }
          setMa3ExtraDraft(nextMa3Draft);
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

  const cycleMa3Multiplier = (master: string) => {
    const order: Array<number | null> = [null, 1.0, 2.0, 0.5];
    setMa3ExtraDraft((prev) => {
      const current = prev[master] ?? null;
      const index = order.findIndex((v) => v === current);
      const next = order[(index + 1) % order.length];
      return { ...prev, [master]: next };
    });
  };

  const ma3MultiplierLabel = (value: number | null) => {
    if (value === null) return "OFF";
    if (value === 2.0) return "*2";
    if (value === 0.5) return "/2";
    return "1x";
  };

  const applyMa3Osc = () => {
    const extras: Ma3OscExtra[] = MA3_EXTRA_MASTERS.flatMap((master) => {
      const value = ma3ExtraDraft[master];
      if (value === null) return [];
      return [{ master, multiplier: value }];
    });
    send({
      type: "set_ma3_osc",
      primary_master: settings.ma3_osc.primary_master || "3.16",
      extras
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

  const inputFieldSx = {
    minWidth: 0,
    "& .MuiInputBase-input": { color: skin.text },
    "& .MuiInputLabel-root": { color: skin.textMuted },
    "& .MuiOutlinedInput-root fieldset": { borderColor: skin.iconButtonBorder }
  };

  const saveButtonSx = {
    minHeight: 41,
    fontWeight: 900,
    letterSpacing: "0.02em",
    color: skin.text,
    bgcolor: skin.buttonPrimary,
    border: `1px solid ${skin.buttonSurfaceBorder}`,
    boxShadow: "0 6px 14px rgba(0,0,0,0.24)",
    "&:hover": { bgcolor: skin.buttonPrimaryHover },
    "&:active": { transform: "translateY(1px)" }
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
          body: { background: skin.bodyBg },
          ".MuiButtonBase-root": {
            WebkitTapHighlightColor: "transparent"
          },
          ".MuiButton-outlined": {
            borderColor: `${skin.iconButtonBorder} !important`
          },
          ".MuiButton-outlined:hover": {
            borderColor: `${skin.iconButtonBorder} !important`
          },
          ".MuiButtonBase-root:focus": {
            outline: "none"
          },
          ".MuiButtonBase-root:focus-visible": {
            outline: "none"
          },
          ".MuiButtonBase-root.Mui-focusVisible": {
            boxShadow: `0 0 0 2px ${skin.iconButtonBorder}`
          },
          ".MuiTouchRipple-root .MuiTouchRipple-child": {
            backgroundColor: `${skin.liveAccentStrong} !important`
          }
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
          background: skin.shellGradient,
          color: skin.text,
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
            background: skin.panelBg,
            border: `1px solid ${skin.panelBorder}`,
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
                  border: `1px solid ${skin.iconButtonBorder}`,
                  bgcolor: skin.iconButtonBg
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
                  borderColor: skin.iconButtonBorder,
                  bgcolor: view === "settings" ? skin.iconButtonActiveBg : skin.iconButtonBg,
                  "&:hover": { bgcolor: view === "settings" ? skin.iconButtonActiveBg : skin.iconButtonHoverBg }
                }}
              >
                <Box sx={{ width: 16, display: "grid", gap: 0.35 }}>
                  <Box sx={{ height: 2, borderRadius: 2, bgcolor: view === "settings" ? activeButtonText : skin.text, width: "100%" }} />
                  <Box
                    sx={{
                      height: 2,
                      borderRadius: 2,
                      bgcolor: view === "settings" ? activeButtonText : skin.text,
                      width: "72%",
                      justifySelf: "end"
                    }}
                  />
                  <Box sx={{ height: 2, borderRadius: 2, bgcolor: view === "settings" ? activeButtonText : skin.text, width: "86%" }} />
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
                <Stack spacing={performanceMode ? 1.15 : 0.9} sx={{ minWidth: 0, pb: 0.4 }}>
                <Typography
                  component="h1"
                  sx={{
                    textAlign: "center",
                    fontWeight: 800,
                    fontSize: performanceMode ? "clamp(3.55rem, 16vw, 6.25rem)" : "clamp(2.6rem, 13vw, 4.6rem)",
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
                    p: performanceMode ? 0.55 : 0.45,
                    mb: performanceMode ? 0.45 : 0,
                    borderRadius: 1.1,
                    bgcolor: skin.insetBg,
                    border: `1px solid ${skin.insetBorder}`
                  }}
                >
                  {[1, 2, 3, 4].map((b) => (
                    <Box
                        key={b}
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        height: performanceMode ? 12 : 9,
                        borderRadius: 1,
                        bgcolor: state.beat === b ? skin.liveAccent : skin.beatOff,
                        transition: "background-color 80ms linear"
                      }}
                    />
                  ))}
                </Stack>

                <Box sx={{ display: "flex", justifyContent: "center", py: performanceMode ? 0.45 : 0.2, mb: performanceMode ? 0.2 : 0 }}>
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
                      width: performanceMode ? "min(78vw, 290px)" : "min(56vw, 200px)",
                      aspectRatio: "1 / 1",
                      border: "none",
                      borderRadius: 2,
                      cursor: "pointer",
                      color: tapButtonText,
                      fontSize: performanceMode ? "2.05rem" : "1.8rem",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      touchAction: "manipulation",
                      WebkitTapHighlightColor: "transparent",
                      userSelect: "none",
                      background: tapPressed ? skin.tapPressed : skin.tapIdle,
                      boxShadow: tapPressed
                        ? `inset 0 0 0 2px ${skin.tapGlow}, 0 1px 10px rgba(0,0,0,0.35)`
                        : "inset 0 0 0 1px rgba(255,255,255,0.18), 0 8px 20px rgba(0,0,0,0.32)",
                      transform: tapPressed ? "scale(0.978)" : "scale(1)",
                      transition: "transform 24ms linear, background-color 42ms linear, box-shadow 42ms linear",
                      "@keyframes tapPulseRing": {
                        "0%": { transform: "scale(0.88)", opacity: 0.55 },
                        "100%": { transform: "scale(1.08)", opacity: 0 }
                      },
                      "@keyframes tapLabelBounce": {
                        "0%": { transform: "translateY(0px) scale(1)" },
                        "30%": { transform: "translateY(1px) scale(0.95)" },
                        "100%": { transform: "translateY(0px) scale(1)" }
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
                        border: `2px solid ${skin.tapGlow}`,
                        pointerEvents: "none",
                        animation: "tapPulseRing 190ms ease-out"
                      }}
                    />
                    <Box
                      component="span"
                      key={tapPulseId}
                      sx={{
                        display: "inline-block",
                        animation: tapPulseId > 0 ? "tapLabelBounce 160ms cubic-bezier(0.22, 0.72, 0.31, 1)" : "none",
                        transform: tapPressed ? "translateY(1px) scale(0.96)" : "translateY(0px) scale(1)",
                        transition: "transform 42ms linear",
                        willChange: "transform"
                      }}
                    >
                      TAP
                    </Box>
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
                    my: performanceMode ? 0.7 : 0,
                    color: skin.slider,
                    "& .MuiSlider-thumb": {
                      width: performanceMode ? 28 : 22,
                      height: performanceMode ? 28 : 22
                    },
                    "& .MuiSlider-track, & .MuiSlider-rail": {
                      height: performanceMode ? 8 : 6,
                      borderRadius: 8
                    },
                    "@media (min-width: 1024px) and (pointer: fine)": {
                      my: performanceMode ? 1.0 : 0
                    }
                  }}
                />

                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 0.7, mt: performanceMode ? 0.15 : 0 }}>
                  <Button
                    variant={resyncPressed ? "contained" : "outlined"}
                    onClick={triggerResync}
                    sx={{
                      minHeight: performanceMode ? 92 : 78,
                      minWidth: 0,
                      fontWeight: 800,
                      fontSize: performanceMode ? "0.98rem" : "0.9rem",
                      borderColor: skin.iconButtonBorder,
                      color: skin.text,
                      bgcolor: resyncPressed ? skin.liveAccentStrong : "transparent",
                      "&:hover": { bgcolor: resyncPressed ? skin.liveAccentStrong : "rgba(255,255,255,0.04)" }
                    }}
                  >
                    RESYNC
                  </Button>
                  <Button
                    variant={metroPressed ? "contained" : "outlined"}
                    onClick={triggerMetroToggle}
                    sx={{
                      minHeight: performanceMode ? 92 : 78,
                      minWidth: 0,
                      fontWeight: 800,
                      fontSize: performanceMode ? "0.98rem" : "0.9rem",
                      borderColor: skin.iconButtonBorder,
                      color: skin.text,
                      bgcolor: metroPressed ? skin.liveAccentStrong : "transparent",
                      "&:hover": { bgcolor: metroPressed ? skin.liveAccentStrong : "rgba(255,255,255,0.04)" }
                    }}
                  >
                    METRO TOGGLE
                  </Button>
                </Box>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${nudgeButtons.length + 2}, minmax(0, 1fr))`,
                    gap: performanceMode ? 0.8 : 0.7
                  }}
                >
                  <Button
                    variant="outlined"
                    onClick={() => send({ type: "set_bpm", bpm: state.bpm / 2 })}
                    sx={{
                      minHeight: performanceMode ? 52 : 40,
                      minWidth: 0,
                      fontWeight: 700,
                      borderColor: skin.iconButtonBorder,
                      color: skin.text
                    }}
                  >
                    /2
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => send({ type: "set_bpm", bpm: state.bpm * 2 })}
                    sx={{
                      minHeight: performanceMode ? 52 : 40,
                      minWidth: 0,
                      fontWeight: 700,
                      borderColor: skin.iconButtonBorder,
                      color: skin.text
                    }}
                  >
                    *2
                  </Button>
                  {nudgeButtons.map((item) => (
                    <Button
                      key={item.label}
                      variant="outlined"
                      onClick={() => send({ type: "nudge", delta: item.delta })}
                      sx={{
                        minHeight: performanceMode ? 52 : 40,
                        minWidth: 0,
                        fontWeight: 700,
                        borderColor: skin.iconButtonBorder,
                        color: skin.text
                      }}
                    >
                      {item.label}
                    </Button>
                  ))}
                </Box>

                {!performanceMode ? (
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
                      bgcolor: skin.insetBg,
                      border: `1px solid ${skin.buttonSurfaceBorder}`,
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
                          borderColor: skin.buttonSurfaceBorder,
                          color: skin.text,
                          bgcolor: skin.buttonSurface,
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                          "&:hover": { bgcolor: skin.buttonSurfaceHover }
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
                        borderColor: skin.buttonSurfaceBorder,
                        color: skin.text,
                        bgcolor: skin.buttonSurface,
                        "&:hover": { bgcolor: skin.buttonSurfaceHover }
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
                        borderColor: skin.buttonSurfaceBorder,
                        color: skin.text,
                        bgcolor: skin.buttonSurface,
                        "&:hover": { bgcolor: skin.buttonSurfaceHover }
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
                        borderColor: skin.buttonSurfaceBorder,
                        color: skin.text,
                        bgcolor: skin.buttonSurface,
                        "&:hover": { bgcolor: skin.buttonSurfaceHover }
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
                        color: activeButtonText,
                        bgcolor: skin.liveAccentStrong,
                        "&:hover": { bgcolor: skin.liveAccentStrong }
                      }}
                    >
                      SET BPM
                    </Button>
                  </Box>
                </Box>
                ) : null}
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
                    bgcolor: skin.cardBg,
                    border: `1px solid ${skin.cardBorder}`,
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
                      color: settings.round_whole_bpm ? activeButtonText : skin.text,
                      bgcolor: settings.round_whole_bpm ? skin.iconButtonActiveBg : skin.buttonPrimary,
                      border: `1px solid ${skin.buttonSurfaceBorder}`,
                      boxShadow: "0 7px 16px rgba(0,0,0,0.24)",
                      "&:hover": {
                        bgcolor: settings.round_whole_bpm ? skin.iconButtonActiveBg : skin.buttonPrimaryHover
                      },
                      "&:active": { transform: "translateY(1px)" }
                    }}
                  >
                    ROUND BPM {settings.round_whole_bpm ? "ON" : "OFF"}
                  </Button>
                  <Button
                    fullWidth
                    variant={performanceMode ? "contained" : "outlined"}
                    onClick={() => setPerformanceMode((prev) => !prev)}
                    sx={{
                      minHeight: 42,
                      mt: 0.7,
                      fontWeight: 800,
                      color: performanceMode ? activeButtonText : skin.text,
                      bgcolor: performanceMode ? skin.liveAccentStrong : "transparent",
                      border: `1px solid ${skin.buttonSurfaceBorder}`,
                      "&:hover": {
                        bgcolor: performanceMode ? skin.liveAccentStrong : "rgba(255,255,255,0.04)"
                      },
                      "&:active": { transform: "translateY(1px)" }
                    }}
                  >
                    PERFORMANCE MODE {performanceMode ? "ON" : "OFF"}
                  </Button>
                </Box>

                {(Object.keys(settings.outputs) as OutputName[]).map((target) => {
                  const cfg = settings.outputs[target];
                  const draft = outputDrafts[target];
                  const accent = skin.outputAccents[target];
                  return (
                    <Box
                      key={target}
                      sx={{
                        p: 1.15,
                        borderRadius: 1.8,
                        bgcolor: skin.cardBg,
                        border: `1px solid ${skin.cardBorder}`,
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
                          sx={inputFieldSx}
                        />
                        <TextField
                          label="Port"
                          value={draft.port}
                          onChange={(e) => updateDraft(target, "port", e.target.value)}
                          size="small"
                          sx={{ ...inputFieldSx, width: 110, minWidth: 90 }}
                        />
                      </Stack>

                      <Button
                        fullWidth
                        variant="contained"
                        onClick={() => applyOutputTarget(target)}
                        sx={{ ...saveButtonSx, mt: 0.9 }}
                      >
                        SAVE {OUTPUT_LABELS[target]} TARGET
                      </Button>

                      {target === "ma3" ? (
                        <Box
                          sx={{
                            mt: 0.95,
                            p: 0.85,
                            borderRadius: 1.3,
                            bgcolor: skin.insetBg,
                            border: `1px solid ${skin.insetBorder}`
                          }}
                        >
                          <Typography sx={{ fontSize: 10, letterSpacing: "0.08em", opacity: 0.75, mb: 0.6 }}>
                            MA3 BPM ROUTING
                          </Typography>
                          <Typography sx={{ fontSize: 11, opacity: 0.8, mb: 0.8 }}>
                            Always sends to Master {settings.ma3_osc.primary_master || "3.16"}.
                          </Typography>
                          <Box
                            sx={{
                              display: "grid",
                              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                              gap: 0.6
                            }}
                          >
                            {MA3_EXTRA_MASTERS.map((master) => {
                              const value = ma3ExtraDraft[master] ?? null;
                              const active = value !== null;
                              return (
                                <Button
                                  key={master}
                                  variant={active ? "contained" : "outlined"}
                                  onClick={() => cycleMa3Multiplier(master)}
                                  sx={{
                                    minHeight: 46,
                                  minWidth: 0,
                                  px: 0.4,
                                  py: 0.3,
                                  display: "grid",
                                  gap: 0.05,
                                  alignContent: "center",
                                    borderColor: skin.iconButtonBorder,
                                    color: skin.text,
                                    bgcolor: active ? skin.buttonPrimary : "transparent",
                                    "&:hover": { bgcolor: active ? skin.buttonPrimaryHover : "rgba(255,255,255,0.04)" },
                                    "&:active": { transform: "translateY(1px)" }
                                  }}
                                >
                                  <Typography sx={{ fontSize: 11, fontWeight: 900, lineHeight: 1 }}>{master}</Typography>
                                  <Typography sx={{ fontSize: 11, fontWeight: 800, lineHeight: 1 }}>{ma3MultiplierLabel(value)}</Typography>
                                </Button>
                              );
                            })}
                          </Box>
                          <Button
                            fullWidth
                            variant="contained"
                            onClick={applyMa3Osc}
                            sx={{ ...saveButtonSx, mt: 0.8 }}
                          >
                            SAVE MA3 ROUTING
                          </Button>
                        </Box>
                      ) : null}

                      {target === "heavym" ? (
                        <Box
                          sx={{
                            mt: 0.95,
                            p: 0.85,
                            borderRadius: 1.3,
                            bgcolor: skin.insetBg,
                            border: `1px solid ${skin.insetBorder}`
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
                              sx={inputFieldSx}
                            />
                            <TextField
                              label="Resync Address"
                              value={heavymOscDraft.resyncAddress}
                              onChange={(e) => updateHeavymOscDraft("resyncAddress", e.target.value)}
                              size="small"
                              fullWidth
                              sx={inputFieldSx}
                            />
                            <Stack direction="row" spacing={0.8}>
                              <TextField
                                label="BPM Min"
                                value={heavymOscDraft.bpmMin}
                                onChange={(e) => updateHeavymOscDraft("bpmMin", e.target.value)}
                                size="small"
                                fullWidth
                                sx={inputFieldSx}
                              />
                              <TextField
                                label="BPM Max"
                                value={heavymOscDraft.bpmMax}
                                onChange={(e) => updateHeavymOscDraft("bpmMax", e.target.value)}
                                size="small"
                                fullWidth
                                sx={inputFieldSx}
                              />
                            </Stack>
                            <TextField
                              label="Resync Value"
                              value={heavymOscDraft.resyncValue}
                              onChange={(e) => updateHeavymOscDraft("resyncValue", e.target.value)}
                              size="small"
                              fullWidth
                              sx={inputFieldSx}
                            />
                            <Stack direction="row" spacing={0.8}>
                              <Button
                                fullWidth
                                variant="contained"
                                onClick={sendHeavymTestBpm}
                                sx={saveButtonSx}
                              >
                                TEST BPM MSG
                              </Button>
                              <Button
                                fullWidth
                                variant="contained"
                                onClick={sendHeavymTestSync}
                                sx={saveButtonSx}
                              >
                                TEST SYNC MSG
                              </Button>
                            </Stack>
                            <Button
                              fullWidth
                              variant="contained"
                              onClick={applyHeavymOsc}
                              sx={saveButtonSx}
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
                          color: skin.text,
                          bgcolor: cfg.enabled ? skin.deactivate : skin.activate,
                          border: `1px solid ${cfg.enabled ? skin.deactivateBorder : skin.activateBorder}`,
                          boxShadow: cfg.enabled
                            ? "0 8px 16px rgba(207,51,74,0.3)"
                            : "0 8px 16px rgba(28,155,102,0.25)",
                          "&:hover": { bgcolor: cfg.enabled ? skin.deactivateHover : skin.activateHover },
                          "&:active": { transform: "translateY(1px)" }
                        }}
                      >
                        {cfg.enabled ? "DEACTIVATE" : "ACTIVATE"}
                      </Button>
                    </Box>
                  );
                })}
                <Box
                  sx={{
                    p: 1.05,
                    borderRadius: 1.7,
                    bgcolor: skin.cardBg,
                    border: `1px solid ${skin.cardBorder}`,
                    boxShadow: "0 8px 18px rgba(0,0,0,0.22)"
                  }}
                >
                  <Typography sx={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.75, mb: 0.8 }}>
                    COLOR SKIN
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 0.65
                    }}
                  >
                    {SKIN_CHOICES.map((choice) => {
                      const active = choice === skinName;
                      return (
                        <Button
                          key={choice}
                          fullWidth
                          variant={active ? "contained" : "outlined"}
                          onClick={() => setSkinName(choice)}
                          sx={{
                            minHeight: 42,
                            justifyContent: "space-between",
                            fontWeight: 800,
                            letterSpacing: "0.03em",
                            color: active ? activeButtonText : skin.text,
                            borderColor: skin.iconButtonBorder,
                            bgcolor: active ? skin.liveAccentStrong : skin.buttonSurface,
                            "&:hover": {
                              bgcolor: active ? skin.liveAccentStrong : skin.buttonSurfaceHover
                            }
                          }}
                        >
                          {SKINS[choice].label}
                          <Box
                            sx={{
                              width: 16,
                              height: 16,
                              borderRadius: "50%",
                              border: `1px solid ${skin.iconButtonBorder}`,
                              bgcolor: SKINS[choice].liveAccentStrong
                            }}
                          />
                        </Button>
                      );
                    })}
                  </Box>
                </Box>
                </Stack>
              )}
            </Box>
          </Box>
        </Stack>
      </Box>
    </>
  );
}
