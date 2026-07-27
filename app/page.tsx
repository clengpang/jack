"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";

type Severity = "red" | "yellow" | "green";
type OpinionStatus = "within" | "exceeds" | "unsupported" | "pending";

type Issue = {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  start: number;
  end: number;
  detail: string;
  suggestion: string;
};

type Opinion = {
  id: string;
  sequence: string;
  timecode: string;
  text: string;
  summary: string;
  reviewer: string;
  status: OpinionStatus;
  dimension: string;
  clauseId: string;
  severity: Severity | "";
  basis: string;
  reason: string;
};

type StandardEntry = {
  id: string;
  dimension: string;
  title: string;
  severity: Severity;
  text: string;
};

type UploadedDoc = {
  id: string;
  name: string;
  kind: "pdf" | "image" | "text";
  size: number;
  progress: number;
  status: "reading" | "recognizing" | "done" | "error";
  text: string;
  preview?: string;
  error?: string;
};

type MediaInfo = {
  name: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  bitrate: number;
};

const severityText: Record<Severity, string> = {
  red: "必须改",
  yellow: "建议改",
  green: "可接受",
};

const opinionStatusText: Record<OpinionStatus, string> = {
  within: "✅ 有标准依据",
  exceeds: "⚠️ 部分相关",
  unsupported: "❓ 超出标准",
  pending: "待判断",
};

const defaultStandard = `2.1-A｜基础技术错误｜必须改｜夹帧、黑帧、白帧或异常画面必须修改。
2.1-B｜基础技术错误｜必须改｜尺寸、格式、清晰度、分辨率或码率不符合交付要求必须修改。
2.1-C｜基础技术错误｜必须改｜嘴型与配音明显错位，音效错误、爆音或异常静音必须修改。
2.2-A｜角色造型一致性｜必须改｜主角发色、服装、脸型、体型发生明显变化必须修改。
2.2-B｜角色造型一致性｜建议改｜主角配饰、鞋子或五官状态出现轻微变化建议修改。
2.2-C｜角色造型一致性｜可接受｜配角不影响识别的轻微造型差异可接受。
2.3-A｜穿帮与连续性｜必须改｜主角、关键道具或前后景关系出现明显穿帮必须修改。
2.3-B｜穿帮与连续性｜建议改｜配角、普通道具、门或物体来源的微小穿帮建议修改。
2.3-C｜穿帮与连续性｜必须改｜空间关系、动作衔接或场景连续性错误影响理解必须修改。
2.4-A｜光影一致性｜必须改｜同一场景光源方向反转、阴影或色温明显跳变必须修改。
2.4-B｜光影一致性｜可接受｜不影响观看的正常场景光影差异可接受。
2.5-A｜画面拉伸变形｜必须改｜主角脸部或肢体明显拉伸、扭曲、动作畸变必须修改。
2.5-B｜画面拉伸变形｜必须改｜背景元素持续扭动、拉伸或画幅比例不一致必须修改。
2.5-C｜画面拉伸变形｜可接受｜背景轻微变形且不影响主体可接受。
2.6-A｜安全构图与卡边｜必须改｜主角脸部、头部被裁切，主体严重遮挡、出画或卡边必须修改。
2.6-B｜安全构图与卡边｜必须改｜文字遮挡人物或关键画面信息必须修改。
2.6-C｜安全构图与卡边｜可接受｜符合叙事目的的半身特写与设计性裁切可接受。
2.7-A｜视频节奏｜必须改｜音画完全错位、台词未结束即切换、气泡与配音不匹配必须修改。
2.7-B｜视频节奏｜建议改｜单页停留时间、交互与镜头时序存在轻微偏差建议调整。
2.7-C｜视频节奏｜可接受｜不影响理解的轻微节奏差异可接受。
2.8-A｜补帧与流畅度｜必须改｜明显卡顿、闪烁、跳帧、低帧率或主体漂移必须修改。
2.8-B｜补帧与流畅度｜建议改｜轻微不流畅但不影响理解建议修改。
2.8-C｜补帧与流畅度｜可接受｜设计性静态画面可接受。
2.9-A｜转场规范｜必须改｜场景变化无转场并造成理解障碍必须修改。
2.9-B｜转场规范｜建议改｜转场时长或形式轻微不统一建议调整。`;

const dimensionNames: Record<string, string> = {
  "2.1": "基础技术错误",
  "2.2": "角色造型一致性",
  "2.3": "穿帮/连续性",
  "2.4": "光影一致性",
  "2.5": "画面拉伸变形",
  "2.6": "安全构图/卡边",
  "2.7": "视频节奏",
  "2.8": "补帧与流畅度",
  "2.9": "转场规范",
};

const severityFromText = (value: string): Severity =>
  /必须|必改|严重|红/.test(value) ? "red" : /建议|黄/.test(value) ? "yellow" : "green";

const standardDimensionRules = [
  ["2.1", /黑帧|白帧|夹帧|格式|尺寸|清晰|分辨率|码率|爆音|静音|音效|嘴型|口型|基础技术/],
  ["2.2", /角色|人物|服装|衣服|脸型|发色|鞋|配饰|造型|体型|眼睛|五官/],
  ["2.3", /穿帮|连续|道具|前景|后景|空间|来源|门|位置变化|衔接/],
  ["2.4", /光影|光源|阴影|色温|明暗/],
  ["2.5", /变形|拉伸|扭曲|画幅|肢体|畸变|背景.*(?:动|飘|抖)/],
  ["2.6", /遮挡|出画|卡边|裁切|构图|人物大小|主体大小|文字.*挡/],
  ["2.7", /音画|同步|节奏|台词|跳转|停留|气泡|配音|交互|镜头.*(?:先|后)/],
  ["2.8", /卡顿|闪烁|跳帧|帧率|漂移|飘|不流畅|补帧|没法看/],
  ["2.9", /转场|场景切换|硬切/],
] as const;

const detectDimensionIds = (text: string) =>
  standardDimensionRules.filter(([, pattern]) => pattern.test(text)).map(([id]) => id);

const alphaCode = (index: number) => {
  let value = index;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result || "A";
};

const parseStandardEntries = (raw: string): StandardEntry[] => {
  const jsonCandidate = raw.replace(/【来源：[^】]+】/g, "").trim();
  try {
    const parsed = JSON.parse(jsonCandidate);
    const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.standards) ? parsed.standards : [];
    if (items.length) {
      return items.map((item: Record<string, unknown>, index: number) => {
        const text = String(item.text ?? item.条款 ?? item.content ?? item.标准内容 ?? "").trim();
        const dimension = String(item.dimension ?? item.维度 ?? detectDimensionIds(text)[0] ?? "自定义");
        return {
          id: String(item.id ?? item.编号 ?? `${dimension}-${alphaCode(index + 1)}`),
          dimension,
          title: String(item.title ?? item.维度名称 ?? dimensionNames[dimension] ?? "上传标准"),
          severity: severityFromText(String(item.severity ?? item.等级 ?? text)),
          text,
        };
      }).filter((item: StandardEntry) => item.text);
    }
  } catch {
    // 非 JSON 标准继续按 PDF / 表格 / 文本预处理。
  }
  const normalized = raw
    .replace(/第\s*\d+\s*页[：:]/g, "\n")
    .replace(/【来源：[^】]+】/g, "\n")
    .replace(/([。；])\s*(?=\d+\.\d+(?:-[A-Z0-9]+)?)/g, "$1\n");
  const sourceLines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const entries: StandardEntry[] = [];
  const counters: Record<string, number> = {};
  let activeDimension = "";
  for (const sourceLine of sourceLines) {
    if (/^(?:审核维度|维度|序号|条款|等级|说明)$/.test(sourceLine)) continue;
    const header = sourceLine.match(/^(\d+\.\d+)\s*[-—、:]?\s*([^。；｜|]{2,30})$/);
    if (header && dimensionNames[header[1]]) {
      activeDimension = header[1];
      continue;
    }
    const pieces = sourceLine.split(/(?<=[。；])\s*/).map((value) => value.trim()).filter((value) => value.length > 3);
    for (const line of pieces) {
      const pipe = line.split(/[｜|]/).map((value) => value.trim()).filter(Boolean);
      const explicit = pipe[0]?.match(/^(\d+\.\d+)(?:-([A-Z0-9]+))?$/i);
      if (explicit && pipe.length >= 3) {
        const dimension = explicit[1];
        counters[dimension] = (counters[dimension] ?? 0) + 1;
        const id = `${dimension}-${explicit[2] || alphaCode(counters[dimension])}`;
        const hasTitle = pipe.length >= 4;
        entries.push({
          id,
          dimension,
          title: hasTitle ? pipe[1] : dimensionNames[dimension] || "上传标准",
          severity: severityFromText(hasTitle ? pipe[2] : pipe[1]),
          text: pipe.slice(hasTitle ? 3 : 2).join("｜"),
        });
        activeDimension = dimension;
        continue;
      }
      const bracket = line.match(/^【([^｜|]+)[｜|]([^】]+)】\s*(.*)$/);
      const detected = detectDimensionIds(line)[0] || activeDimension || "自定义";
      counters[detected] = (counters[detected] ?? 0) + 1;
      entries.push({
        id: `${detected}-${alphaCode(counters[detected])}`,
        dimension: detected,
        title: bracket?.[1] || dimensionNames[detected] || "上传标准",
        severity: severityFromText(bracket?.[2] || line),
        text: bracket?.[3] || line.replace(/^\d+\.\d+(?:-[A-Z0-9]+)?\s*[-—、:]?\s*/i, ""),
      });
    }
  }
  return entries.filter((entry, index, list) => entry.text && list.findIndex((item) => item.id === entry.id) === index);
};

const formatTime = (seconds: number) => {
  const value = Math.max(0, seconds || 0);
  const m = Math.floor(value / 60);
  const s = Math.floor(value % 60);
  const ms = Math.floor((value % 1) * 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
};

const formatSize = (bytes: number) =>
  bytes > 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const docKind = (file: File): UploadedDoc["kind"] => {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/")) return "image";
  return "text";
};

const docKindText: Record<UploadedDoc["kind"], string> = {
  pdf: "PDF",
  image: "图片 OCR",
  text: "文本",
};

const makeDownload = (content: string, mime: string, name: string) => {
  const blob = new Blob(["\uFEFF", content], { type: mime });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
};

const csvEscape = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;

const groupTimes = (
  times: number[],
  gap: number,
  category: string,
  severity: Severity,
  title: string,
  detail: string,
  suggestion: string,
) => {
  if (!times.length) return [] as Issue[];
  const groups: Array<[number, number]> = [];
  let start = times[0];
  let end = times[0] + gap;
  for (let i = 1; i < times.length; i++) {
    if (times[i] - end <= gap * 0.65) end = times[i] + gap;
    else {
      groups.push([start, end]);
      start = times[i];
      end = times[i] + gap;
    }
  }
  groups.push([start, end]);
  return groups.map(([from, to], index) => ({
    id: `${category}-${from}-${index}`,
    severity,
    category,
    title,
    start: from,
    end: to,
    detail,
    suggestion,
  }));
};

const extractTerms = (text: string) => {
  const cleaned = text
    .replace(/[【】[\]（）()，。；：、,.!?！？\s\d]/g, "")
    .replace(/必须|建议|修改|接受|问题|画面|视频|审核/g, "");
  const terms = new Set<string>();
  for (let i = 0; i < cleaned.length - 1; i++) terms.add(cleaned.slice(i, i + 2));
  return [...terms];
};

const parseOpinions = (raw: string): Opinion[] => {
  let rows: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) rows = parsed;
    else if (Array.isArray(parsed?.opinions)) rows = parsed.opinions;
    else if (Array.isArray(parsed?.反馈意见)) rows = parsed.反馈意见;
  } catch {
    let currentReviewer = "";
    const normalized = raw
      .replace(/第\s*\d+\s*页[：:]/g, "\n")
      .replace(/\s*((?:编导|设计|教研|导演|客户|制片|审核)[^\s，,：:]{0,8}(?:审核|反馈|意见))[：:]?\s*/g, "\n$1\n")
      .replace(/\s+(?=(?:#\s*)?\d{1,3}[.、）)]\s*)/g, "\n");
    rows = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
        const reviewerHeader = line.match(/^([^\s，,：:]{1,12})(?:审核|反馈|意见)[：:]?$/);
        if (reviewerHeader) {
          currentReviewer = reviewerHeader[1];
          return [];
        }
        const cells = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((v) => v.replace(/^"|"$/g, "").trim());
        const sequence = line.match(/^(?:#\s*)?(\d{1,3})[.、）)]?\s*/)?.[1] ?? "";
        const cleaned = line.replace(/^(?:[-•·]\s*|(?:#\s*)?\d{1,3}[.、）)]?\s*)/, "").trim();
        if (!cleaned || /^(?:序号|审核意见|反馈内容|意见内容|反馈人|审核人)$/.test(cleaned)) return [];
        return [cells.length >= 3
          ? { sequence: cells[0], reviewer: cells[1], text: cells.slice(2).join("，") }
          : { sequence, reviewer: currentReviewer, text: cleaned }];
      });
  }
  return rows
    .map((row, index) => {
      const text = String(row.text ?? row.审核意见 ?? row.意见 ?? row.content ?? "").trim();
      const inlineTime = text.match(/\b\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?\b/)?.[0] ?? "";
      return {
        id: String(row.id ?? `OP-${String(index + 1).padStart(3, "0")}`),
        sequence: String(row.sequence ?? row.序号 ?? row.id ?? index + 1),
        timecode: String(row.timecode ?? row.时间码 ?? inlineTime),
        text,
        summary: text.replace(/\b\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?\b/g, "").slice(0, 48),
        reviewer: String(row.reviewer ?? row.审核人 ?? row.反馈人员 ?? ""),
        status: "pending" as OpinionStatus,
        dimension: "",
        clauseId: "",
        severity: "",
        basis: "",
        reason: "",
      };
    })
    .filter((item) => item.text);
};

const compareOpinion = (opinion: Opinion, entries: StandardEntry[]): Opinion => {
  const terms = extractTerms(opinion.text);
  const detectedDimensions = detectDimensionIds(opinion.text);
  const primaryDimension = detectedDimensions[0] ?? "";
  let best: StandardEntry | undefined;
  let bestScore = 0;
  for (const entry of entries) {
    const standardTerms = new Set(extractTerms(`${entry.title}${entry.text}`));
    const dimensionBonus = detectedDimensions.includes(entry.dimension) ? 3 : 0;
    const score = terms.filter((term) => standardTerms.has(term)).length + dimensionBonus;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  const creativeCue = /应该|可以考虑|希望|更有感觉|更好看|更突出|主线|剧情|叙事|出场|氛围|尴尬|感染力|呈现方式|先.+再|不应该是.+表情|不要再出现/.test(opinion.text);
  const summary = opinion.text.replace(/\b\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?\b/g, "").slice(0, 48);
  if (!best || bestScore < 2 || (creativeCue && !primaryDimension)) {
    return {
      ...opinion,
      summary,
      status: "unsupported",
      dimension: "创意/主观建议",
      clauseId: "—",
      severity: "",
      basis: "",
      reason: "属于创意方向或个人偏好，当前标准无直接条款依据，建议作为创意建议单独讨论。",
    };
  }
  const strongRequest = /必须|一律|全部|完全|统一|重做|推翻|不能|严禁/.test(opinion.text);
  const ambiguousCue = /有点|不太|感觉|似乎|可能|建议|适当|尽量|奇怪|不和谐|没法看/.test(opinion.text);
  const dimensionLabel = detectedDimensions.length
    ? detectedDimensions.map((id) => `${id} ${dimensionNames[id]}`).join(" + ")
    : `${best.dimension} ${best.title}`;
  if ((strongRequest && best.severity !== "red") || ambiguousCue || bestScore < 4) {
    return {
      ...opinion,
      summary,
      status: "exceeds",
      dimension: dimensionLabel,
      clauseId: best.id,
      severity: best.severity,
      basis: `${best.id}｜${best.title}｜${severityText[best.severity]}｜${best.text}`,
      reason: strongRequest && best.severity !== "red" ? "标准中有相关条目，但该意见的强制程度高于对应条款。" : "涉及的问题在审核标准中有提及，但具体场景或证据未被明确覆盖，建议人工复核。",
    };
  }
  return {
    ...opinion,
    summary,
    status: "within",
    dimension: dimensionLabel,
    clauseId: best.id,
    severity: best.severity,
    basis: `${best.id}｜${best.title}｜${severityText[best.severity]}｜${best.text}`,
    reason: "反馈内容能直接对应到审核标准中的具体条款，有明确标准依据。",
  };
};

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const standardInputRef = useRef<HTMLInputElement>(null);
  const opinionInputRef = useRef<HTMLInputElement>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [standardText, setStandardText] = useState(defaultStandard);
  const [standardDocs, setStandardDocs] = useState<UploadedDoc[]>([]);
  const [opinionDocs, setOpinionDocs] = useState<UploadedDoc[]>([]);
  const [opinionDraft, setOpinionDraft] = useState("");
  const [opinions, setOpinions] = useState<Opinion[]>([]);
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("等待准备三类审核材料");
  const [running, setRunning] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | Severity>("all");
  const [sampleSeconds, setSampleSeconds] = useState(0.5);
  const [blackThreshold, setBlackThreshold] = useState(10);
  const [freezeThreshold, setFreezeThreshold] = useState(2.2);
  const [apiEndpoint, setApiEndpoint] = useState("");
  const [apiModel, setApiModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelQuestion, setModelQuestion] = useState("请复核所有审核意见，重点识别超出审核标准的强制性要求。");
  const [modelReply, setModelReply] = useState("");
  const [modelRunning, setModelRunning] = useState(false);

  const standardLines = useMemo(
    () => standardText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    [standardText],
  );
  const standardEntries = useMemo(() => parseStandardEntries(standardText), [standardText]);

  const summary = useMemo(
    () => ({
      red: issues.filter((item) => item.severity === "red").length,
      yellow: issues.filter((item) => item.severity === "yellow").length,
      green: issues.filter((item) => item.severity === "green").length,
    }),
    [issues],
  );

  const opinionSummary = useMemo(
    () => ({
      within: opinions.filter((item) => item.status === "within").length,
      exceeds: opinions.filter((item) => item.status === "exceeds").length,
      unsupported: opinions.filter((item) => item.status === "unsupported").length,
      pending: opinions.filter((item) => item.status === "pending").length,
    }),
    [opinions],
  );
  const opinionTotal = Math.max(1, opinions.length);
  const judgedTotal = opinions.filter((item) => item.status !== "pending").length;
  const dimensionDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    opinions.filter((item) => item.status === "within" || item.status === "exceeds").forEach((item) => {
      const key = item.dimension || "未分类";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [opinions]);
  const reviewerSummary = useMemo(() => {
    const groups = new Map<string, { total: number; within: number; exceeds: number; unsupported: number }>();
    opinions.forEach((item) => {
      const key = item.reviewer || "未注明审核人";
      const current = groups.get(key) ?? { total: 0, within: 0, exceeds: 0, unsupported: 0 };
      current.total += 1;
      if (item.status !== "pending") current[item.status] += 1;
      groups.set(key, current);
    });
    return [...groups.entries()];
  }, [opinions]);

  const filteredIssues = useMemo(
    () => activeFilter === "all" ? issues : issues.filter((item) => item.severity === activeFilter),
    [activeFilter, issues],
  );

  const onVideoFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0];
    if (!next) return;
    setVideoUploadProgress(1);
    const reader = next.stream().getReader();
    let loaded = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      loaded += chunk.value.byteLength;
      setVideoUploadProgress(Math.min(99, Math.round((loaded / next.size) * 100)));
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(next);
    setVideoUrl(URL.createObjectURL(next));
    setVideoUploadProgress(100);
    setInfo(null);
    setIssues([]);
    setProgress(0);
    setStatus("视频已就绪，可开始综合审核");
  };

  const updateDoc = (
    group: "standard" | "opinion",
    id: string,
    patch: Partial<UploadedDoc>,
  ) => {
    const setter = group === "standard" ? setStandardDocs : setOpinionDocs;
    setter((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const processDocument = async (
    file: File,
    group: "standard" | "opinion",
    id: string,
  ) => {
    const kind = docKind(file);
    try {
      let text = "";
      if (kind === "text") {
        const reader = new FileReader();
        text = await new Promise<string>((resolve, reject) => {
          reader.onprogress = (event) => {
            if (event.lengthComputable) updateDoc(group, id, { progress: Math.round((event.loaded / event.total) * 90) });
          };
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(reader.error);
          reader.readAsText(file);
        });
      } else if (kind === "pdf") {
        updateDoc(group, id, { status: "recognizing", progress: 10 });
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const pages: string[] = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          const pageText = content.items.map((item) => {
            if (!("str" in item)) return "";
            return `${item.str}${"hasEOL" in item && item.hasEOL ? "\n" : " "}`;
          }).join("");
          pages.push(`第${pageNumber}页：${pageText}`);
          updateDoc(group, id, { progress: 10 + Math.round((pageNumber / pdf.numPages) * 85) });
        }
        text = pages.join("\n");
      } else {
        updateDoc(group, id, { status: "recognizing", progress: 5 });
        const { recognize } = await import("tesseract.js");
        const result = await recognize(file, "chi_sim+eng", {
          logger: (message) => {
            if (message.status === "recognizing text") {
              updateDoc(group, id, { progress: 15 + Math.round((message.progress || 0) * 80) });
            }
          },
        });
        text = result.data.text;
      }

      updateDoc(group, id, { text, status: "done", progress: 100 });
      if (group === "standard") {
        setStandardText((current) => [current, `【来源：${file.name}】`, text].filter(Boolean).join("\n"));
      } else {
        setOpinions((current) => {
          const parsed = parseOpinions(text);
          return [
            ...current,
            ...parsed.map((item, index) => ({
              ...item,
              id: `OP-${String(current.length + index + 1).padStart(3, "0")}`,
            })),
          ];
        });
      }
    } catch (error) {
      updateDoc(group, id, {
        status: "error",
        progress: 100,
        error: error instanceof Error ? error.message : "文件解析失败",
      });
    }
  };

  const onDocuments = async (
    event: ChangeEvent<HTMLInputElement>,
    group: "standard" | "opinion",
  ) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const docs: UploadedDoc[] = files.map((file, index) => ({
      id: `${group}-${Date.now()}-${index}`,
      name: file.name,
      kind: docKind(file),
      size: file.size,
      progress: 0,
      status: "reading",
      text: "",
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    const setter = group === "standard" ? setStandardDocs : setOpinionDocs;
    if (group === "standard" && standardDocs.length === 0) setStandardText("");
    setter((current) => [...current, ...docs]);
    for (let index = 0; index < files.length; index++) {
      await processDocument(files[index], group, docs[index].id);
    }
    event.target.value = "";
  };

  const addOpinion = () => {
    const text = opinionDraft.trim();
    if (!text) return;
    setOpinions((current) => [
      ...current,
      {
        id: `OP-${String(current.length + 1).padStart(3, "0")}`,
        sequence: String(current.length + 1),
        timecode: text.match(/\b\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?\b/)?.[0] ?? "",
        text,
        summary: text.replace(/\b\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?\b/g, "").slice(0, 48),
        reviewer: "手动输入",
        status: "pending",
        dimension: "",
        clauseId: "",
        severity: "",
        basis: "",
        reason: "",
      },
    ]);
    setOpinionDraft("");
  };

  const runOpinionComparison = () => {
    setOpinions((current) => current.map((item) => compareOpinion(item, standardEntries)));
  };

  const seek = (video: HTMLVideoElement, time: number) =>
    new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("视频定位超时")), 8000);
      const done = () => {
        window.clearTimeout(timer);
        video.removeEventListener("seeked", done);
        resolve();
      };
      video.addEventListener("seeked", done);
      video.currentTime = Math.min(time, Math.max(0, video.duration - 0.02));
    });

  const analyzeVideo = async () => {
    const video = videoRef.current;
    if (!videoFile || !video) return;
    setRunning(true);
    setIssues([]);
    setProgress(2);
    setStatus("读取视频规格…");
    try {
      if (!Number.isFinite(video.duration) || !video.videoWidth) {
        await new Promise<void>((resolve) =>
          video.addEventListener("loadedmetadata", () => resolve(), { once: true }),
        );
      }
      const duration = video.duration;
      const media: MediaInfo = {
        name: videoFile.name,
        size: videoFile.size,
        duration,
        width: video.videoWidth,
        height: video.videoHeight,
        bitrate: (videoFile.size * 8) / Math.max(1, duration) / 1000,
      };
      setInfo(media);
      const found: Issue[] = [];
      const aspect = video.videoWidth / video.videoHeight;
      if (Math.abs(aspect - 16 / 9) > 0.025) {
        found.push({
          id: "spec-aspect",
          severity: "red",
          category: "基础规格",
          title: "画面比例不是 16:9",
          start: 0,
          end: duration,
          detail: `当前为 ${video.videoWidth} × ${video.videoHeight}，比例 ${aspect.toFixed(3)}。`,
          suggestion: "按交付规范重新设置画布尺寸，检查是否存在拉伸或黑边。",
        });
      }
      if (video.videoWidth < 1920 || video.videoHeight < 1080) {
        found.push({
          id: "spec-resolution",
          severity: "yellow",
          category: "基础规格",
          title: "分辨率低于 1080P",
          start: 0,
          end: duration,
          detail: `当前分辨率 ${video.videoWidth} × ${video.videoHeight}。`,
          suggestion: "若为最终交付版，建议输出 1920 × 1080 或更高分辨率。",
        });
      }

      const step = Math.max(sampleSeconds, duration / 260);
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = Math.max(180, Math.round((320 * video.videoHeight) / video.videoWidth));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("浏览器无法创建画面分析器");
      const black: number[] = [];
      const white: number[] = [];
      const frozen: number[] = [];
      const flashes: number[] = [];
      let previous: Uint8ClampedArray | null = null;
      let previousLuma: number | null = null;
      const frameCount = Math.max(1, Math.floor(duration / step));

      for (let index = 0; index <= frameCount; index++) {
        const time = Math.min(index * step, duration - 0.02);
        await seek(video, time);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let luma = 0;
        let samples = 0;
        let diff = 0;
        for (let pixel = 0; pixel < pixels.length; pixel += 64) {
          const value = pixels[pixel] * 0.2126 + pixels[pixel + 1] * 0.7152 + pixels[pixel + 2] * 0.0722;
          luma += value;
          if (previous) {
            diff += (
              Math.abs(pixels[pixel] - previous[pixel]) +
              Math.abs(pixels[pixel + 1] - previous[pixel + 1]) +
              Math.abs(pixels[pixel + 2] - previous[pixel + 2])
            ) / 3;
          }
          samples++;
        }
        const avg = luma / samples;
        const avgDiff = previous ? diff / samples : 255;
        if (avg < blackThreshold) black.push(time);
        if (avg > 248) white.push(time);
        if (previous && avgDiff < freezeThreshold) frozen.push(time);
        if (previousLuma !== null && Math.abs(avg - previousLuma) > 62) flashes.push(time);
        previous = new Uint8ClampedArray(pixels);
        previousLuma = avg;
        setProgress(8 + Math.round((index / frameCount) * 58));
        setStatus(`分析画面 ${index + 1} / ${frameCount + 1}`);
      }

      found.push(
        ...groupTimes(black, step, "基础技术", "red", "检测到黑帧或极暗画面", `平均亮度低于阈值 ${blackThreshold}。`, "检查是否为非设计性黑场、转场残留或素材缺失。"),
        ...groupTimes(white, step, "基础技术", "red", "检测到白帧或极亮画面", "画面平均亮度接近纯白。", "检查是否存在白帧、闪白或导出异常。"),
        ...groupTimes(frozen, step, "流畅度", "yellow", "疑似静帧或画面卡顿", `相邻采样画面差异低于 ${freezeThreshold.toFixed(1)}。`, "确认是否为设计性停顿；若不是，请检查补帧与视频编码。")
          .filter((item) => item.end - item.start >= Math.max(1, step * 1.5)),
        ...groupTimes(flashes, step, "光影", "yellow", "画面亮度发生强烈跳变", "相邻画面平均亮度变化超过 62。", "检查闪烁、闪黑、光源反转或不合适的硬切转场。"),
      );

      setStatus("分析音频静音与峰值…");
      setProgress(70);
      try {
        const audioBuffer = await new AudioContext().decodeAudioData(await videoFile.arrayBuffer());
        const channel = audioBuffer.getChannelData(0);
        const audioStep = 0.5;
        const windowSize = Math.max(1, Math.floor(audioBuffer.sampleRate * audioStep));
        const silent: number[] = [];
        const clipped: number[] = [];
        for (let start = 0; start < channel.length; start += windowSize) {
          let sum = 0;
          let peak = 0;
          const end = Math.min(channel.length, start + windowSize);
          for (let i = start; i < end; i += 8) {
            const value = Math.abs(channel[i]);
            sum += value * value;
            peak = Math.max(peak, value);
          }
          const samples = Math.max(1, Math.ceil((end - start) / 8));
          const rms = Math.sqrt(sum / samples);
          const db = 20 * Math.log10(Math.max(rms, 0.000001));
          const time = start / audioBuffer.sampleRate;
          if (db < -52) silent.push(time);
          if (peak > 0.985) clipped.push(time);
          setProgress(70 + Math.round((start / channel.length) * 22));
        }
        found.push(
          ...groupTimes(silent, audioStep, "音频", "yellow", "检测到持续静音", "音频响度低于 -52 dB。", "确认是否为设计性留白；检查旁白、环境音或素材是否缺失。")
            .filter((item) => item.end - item.start >= 1),
          ...groupTimes(clipped, audioStep, "音频", "red", "音频疑似削波爆音", "采样峰值接近 0 dBFS。", "降低增益并重新限制峰值，避免刺耳爆音。"),
        );
      } catch {
        found.push({
          id: "audio-unavailable",
          severity: "green",
          category: "音频",
          title: "当前编码暂不支持浏览器音频解析",
          start: 0,
          end: 0,
          detail: "画面质检已完成，音频检测被跳过。",
          suggestion: "可转为常用 MP4/AAC 格式后重新检测。",
        });
      }

      found.sort((a, b) => a.start - b.start || a.severity.localeCompare(b.severity));
      setIssues(found);
      setOpinions((current) => current.map((item) => compareOpinion(item, standardEntries)));
      setProgress(100);
      setStatus(`综合审核完成：${found.length} 项视频问题，${opinions.length} 条审核意见`);
      video.currentTime = 0;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "分析失败，请更换视频后重试");
    } finally {
      setRunning(false);
    }
  };

  const jumpTo = (issue: Issue) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = issue.start;
    video.play().catch(() => undefined);
  };

  const buildModelPayload = () => ({
    task: modelQuestion,
    instructions: [
      "你是绘本视频审核标准校验专家。必须逐条处理，不得合并、概括或遗漏任何意见。",
      "1. 每条反馈单独提取核心问题，去掉情绪化表述。",
      "2. 在结构化审核标准中搜索最匹配的维度和唯一条款编号。",
      "3. status只允许：within=有标准依据（直接对应具体条款）；exceeds=部分相关（标准提及该问题但具体场景未明确覆盖）；unsupported=超出标准（个人创意偏好、叙事或导演建议，无直接条款）。",
      "4. within或exceeds必须标注severity：red=必改、yellow=建议改、green=可接受；unsupported的severity必须为空。",
      "5. 只返回JSON数组，每个输入id必须恰好返回一次。字段：id,sequence,reviewer,summary,dimension,clauseId,status,severity,basis,reason。",
    ].join("\n"),
    review_standard: standardEntries,
    review_opinions: opinions.map(({ id, sequence, timecode, text, reviewer }) => ({ id, sequence, timecode, text, reviewer })),
    required_statistics: ["总反馈条数", "有标准依据占比", "部分相关占比", "超出标准占比", "仅计算有标准依据和部分相关的各维度问题分布"],
    video_auto_qc: issues,
    video_metadata: info,
  });

  const callModel = async () => {
    if (!apiEndpoint || !apiModel || !apiKey) {
      setModelReply("请先填写兼容 OpenAI 格式的 API 地址、模型名称和临时 API Key。凭证仅保存在当前页面内存中。");
      return;
    }
    setModelRunning(true);
    setModelReply("正在调用模型…");
    try {
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: apiModel,
          temperature: 0.1,
          messages: [
            { role: "system", content: "你是绘本视频审核标准校验专家。审核标准是唯一校验边界，创意建议不能伪装成标准性必改项。" },
            { role: "user", content: JSON.stringify(buildModelPayload()) },
          ],
        }),
      });
      if (!response.ok) throw new Error(`调用失败：HTTP ${response.status}`);
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content ?? JSON.stringify(data);
      setModelReply(content);
      const cleaned = String(content).replace(/^```json|```$/g, "").trim();
      const decisions = JSON.parse(cleaned);
      if (Array.isArray(decisions)) {
        setOpinions((current) =>
          current.map((item) => {
            const match = decisions.find((decision) => String(decision.id) === item.id);
            if (!match) return item;
            const nextStatus = ["within", "exceeds", "unsupported"].includes(match.status)
              ? match.status as OpinionStatus
              : item.status;
            const nextSeverity = nextStatus === "unsupported"
              ? ""
              : ["red", "yellow", "green"].includes(match.severity) ? match.severity as Severity : item.severity;
            return { ...item, status: nextStatus, summary: String(match.summary ?? item.summary), dimension: String(match.dimension ?? item.dimension), clauseId: String(match.clauseId ?? item.clauseId), severity: nextSeverity, basis: String(match.basis ?? ""), reason: String(match.reason ?? "") };
          }),
        );
      }
    } catch (error) {
      setModelReply(error instanceof Error ? error.message : "模型调用失败，请检查地址、模型与跨域权限。");
    } finally {
      setModelRunning(false);
    }
  };

  const exportReport = (type: "json" | "csv") => {
    const fileBase = (info?.name ?? videoFile?.name ?? "视频").replace(/\.[^.]+$/, "");
    if (type === "json") {
      makeDownload(
        JSON.stringify({
          generated_at: new Date().toISOString(),
          media: info,
          standard: standardLines,
          structured_standard: standardEntries,
          auto_qc: issues,
          opinion_summary: { total: opinions.length, judged: judgedTotal, ...opinionSummary },
          reviewer_summary: reviewerSummary,
          dimension_distribution_supported_and_partial_only: Object.fromEntries(dimensionDistribution),
          review_validation_results: opinions.filter((item) => item.status === "within" || item.status === "exceeds"),
          creative_suggestions: opinions.filter((item) => item.status === "unsupported"),
          annotated_opinions: opinions,
          model_reply: modelReply,
        }, null, 2),
        "application/json",
        `${fileBase}-综合审核报告.json`,
      );
      return;
    }
    const headers = ["序号", "反馈人", "反馈内容摘要", "对应维度", "对应条款", "判定", "建议等级", "说明"];
    const rows = opinions.map((item) => [
      item.sequence || item.id,
      item.reviewer,
      item.summary,
      item.dimension,
      item.basis || item.clauseId,
      opinionStatusText[item.status],
      item.severity ? severityText[item.severity] : "",
      item.reason,
    ]);
    makeDownload(
      [headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n"),
      "text/csv;charset=utf-8",
      `${fileBase}-审核意见标注.csv`,
    );
  };

  const renderDocs = (docs: UploadedDoc[]) => (
    <div className="docList">
      {docs.map((doc) => (
        <div className={`docItem ${doc.status}`} key={doc.id}>
          {doc.preview ? <img src={doc.preview} alt="" /> : <span className="docType">{doc.kind === "pdf" ? "PDF" : "TXT"}</span>}
          <div className="docInfo">
            <div><strong>{doc.name}</strong><small>{docKindText[doc.kind]} · {formatSize(doc.size)}</small></div>
            <div className="fileProgress"><span style={{ width: `${doc.progress}%` }} /></div>
            <small>{doc.status === "done" ? `已提取 ${doc.text.length} 字` : doc.status === "error" ? doc.error : doc.status === "recognizing" ? `正在识别 ${doc.progress}%` : `正在读取 ${doc.progress}%`}</small>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brandMark">帧</span>
          <div><strong>FRAMECHECK</strong><span>AI 视频审核工作台</span></div>
        </div>
        <div className="privacy"><i /> 视频本地分析 · 模型仅接收结构化文本</div>
      </header>

      <section className="hero compactHero">
        <div>
          <span className="eyebrow">AI REVIEW OPERATING SYSTEM · V3</span>
          <h1>让标准约束意见，<br /><em>让视频验证判断。</em></h1>
          <p>同时对比审核标准、历史审核意见与视频自动质检结果，标出超出标准或缺少依据的意见，并形成可下载的结构化报告。</p>
        </div>
        <div className="heroStat">
          <strong>{opinions.length || "—"}</strong>
          <span>待核验审核意见</span>
          <small>{status}</small>
        </div>
      </section>

      <section className="intake">
        <article className="intakeCard">
          <div className="intakeNumber">01</div>
          <div className="intakeTitle"><strong>审核标准资料</strong><span>{standardDocs.length} 个文件 · {standardEntries.length} 条编号条款</span></div>
          <label className="multiUpload" htmlFor="standard-file-input">
            <span>＋</span><strong>批量上传标准文件</strong><small>PDF、图片、TXT、MD、CSV、JSON</small>
          </label>
          <input id="standard-file-input" ref={standardInputRef} className="nativeFileInput" aria-label="选择审核标准文件" type="file" multiple accept=".pdf,image/*,.txt,.md,.csv,.tsv,.json" onChange={(event) => onDocuments(event, "standard")} />
          {renderDocs(standardDocs)}
          <details className="standardIndex">
            <summary>查看结构化条款（{standardEntries.length}）</summary>
            <div>{standardEntries.map((entry) => <span key={entry.id}><b>{entry.id}</b><em>{entry.title}</em><i className={`badge ${entry.severity}`}>{severityText[entry.severity]}</i><small>{entry.text}</small></span>)}</div>
          </details>
          <details className="textEditor">
            <summary>查看 / 编辑已提取标准文本</summary>
            <textarea value={standardText} onChange={(event) => setStandardText(event.target.value)} aria-label="审核标准内容" />
          </details>
        </article>

        <article className="intakeCard">
          <div className="intakeNumber">02</div>
          <div className="intakeTitle"><strong>审核意见资料</strong><span>{opinionDocs.length} 个文件 · {opinions.length} 条意见</span></div>
          <label className="multiUpload" htmlFor="opinion-file-input">
            <span>＋</span><strong>批量上传意见文件</strong><small>PDF、图片、TXT、CSV、JSON</small>
          </label>
          <input id="opinion-file-input" ref={opinionInputRef} className="nativeFileInput" aria-label="选择审核意见文件" type="file" multiple accept=".pdf,image/*,.txt,.md,.csv,.tsv,.json" onChange={(event) => onDocuments(event, "opinion")} />
          {renderDocs(opinionDocs)}
          <div className="opinionComposer">
            <textarea value={opinionDraft} onChange={(event) => setOpinionDraft(event.target.value)} placeholder="输入意见，例如：00:18 主角服装必须全部重做…" aria-label="新增审核意见" />
            <button onClick={addOpinion}>添加</button>
          </div>
        </article>

        <article className="intakeCard videoIntake">
          <div className="intakeNumber">03</div>
          <div className="intakeTitle"><strong>视频素材</strong><span>{videoFile ? formatSize(videoFile.size) : "尚未选择"}</span></div>
          <label className="miniDropzone" htmlFor="video-file-input">
            <span>▶</span>
            <strong>{videoFile?.name || "选择视频文件"}</strong>
            <small>MP4、MOV、WebM · 不上传服务器</small>
          </label>
          <input id="video-file-input" ref={videoInputRef} className="nativeFileInput" aria-label="选择视频素材" type="file" accept="video/*" onChange={onVideoFile} />
          <div className="videoProgress">
            <div><span>{videoFile ? "视频读取完成" : "等待选择视频"}</span><b>{videoUploadProgress}%</b></div>
            <div className="fileProgress"><span style={{ width: `${videoUploadProgress}%` }} /></div>
          </div>
        </article>
      </section>

      <section className="workspace reviewWorkspace">
        <aside className="controlPanel">
          <div className="sectionLabel">04 · 综合审核</div>
          <div className="readiness">
            <span className={standardEntries.length ? "ready" : ""}>审核标准 <b>{standardEntries.length ? `${standardEntries.length} 条已编号` : "缺失"}</b></span>
            <span className={opinions.length ? "ready" : ""}>审核意见 <b>{opinions.length ? `${opinions.length} 条` : "缺失"}</b></span>
            <span className={videoFile ? "ready" : ""}>视频素材 <b>{videoFile ? "已就绪" : "缺失"}</b></span>
          </div>
          <label className="rangeRow"><span>采样间隔 <b>{sampleSeconds.toFixed(1)}s</b></span><input type="range" min="0.25" max="2" step="0.25" value={sampleSeconds} onChange={(e) => setSampleSeconds(Number(e.target.value))} /></label>
          <label className="rangeRow"><span>黑帧阈值 <b>{blackThreshold}</b></span><input type="range" min="4" max="30" step="1" value={blackThreshold} onChange={(e) => setBlackThreshold(Number(e.target.value))} /></label>
          <label className="rangeRow"><span>静帧灵敏度 <b>{freezeThreshold.toFixed(1)}</b></span><input type="range" min="0.8" max="6" step="0.2" value={freezeThreshold} onChange={(e) => setFreezeThreshold(Number(e.target.value))} /></label>
          <button className="secondaryAction" disabled={!opinions.length || !standardEntries.length} onClick={runOpinionComparison}>逐条校验全部意见</button>
          <button className="analyzeButton" disabled={!videoFile || !standardEntries.length || running} onClick={analyzeVideo}>{running ? "正在综合审核…" : "开始视频综合审核"}</button>
          <div className="progressTrack"><span style={{ width: `${progress}%` }} /></div>
          <p className="statusText">{status}</p>
        </aside>

        <div className="contentPanel">
          <div className="previewCard">
            {videoUrl ? <video ref={videoRef} src={videoUrl} controls preload="metadata" /> : <div className="emptyPreview"><span>▶</span><strong>等待视频</strong><small>上传后可定位自动质检问题</small></div>}
            {info && <div className="mediaMeta"><span><b>{info.width} × {info.height}</b>分辨率</span><span><b>{formatTime(info.duration)}</b>时长</span><span><b>{Math.round(info.bitrate)} kbps</b>估算码率</span><span><b>{formatSize(info.size)}</b>文件大小</span></div>}
          </div>
        </div>
      </section>

      <section className="reportSection">
        <div className="resultHeader">
          <div><span className="sectionLabel">05 · 审核意见越界标注</span><h2>标准边界核验</h2></div>
          <div className="reportActions"><button onClick={() => exportReport("csv")} disabled={!opinions.length}>下载标注 CSV</button><button onClick={() => exportReport("json")} disabled={!opinions.length && !issues.length}>下载完整 JSON</button></div>
        </div>
        <div className="opinionSummaryGrid">
          <div className="opinionSummary total"><span>总反馈条数</span><strong>{opinions.length}</strong><small>{opinionSummary.pending ? `${opinionSummary.pending} 条待判断` : `${judgedTotal} 条已判断`}</small></div>
          {(["within", "exceeds", "unsupported"] as OpinionStatus[]).map((key) => <div className={`opinionSummary ${key}`} key={key}><span>{opinionStatusText[key]}</span><strong>{opinionSummary[key]}</strong><small>{opinions.length ? `${Math.round((opinionSummary[key] / opinionTotal) * 100)}%` : "0%"}</small></div>)}
        </div>
        {!!reviewerSummary.length && <div className="reviewerPanel"><div><strong>反馈人分组小结</strong><small>逐人核对总数与三级判定，便于发现遗漏。</small></div><div className="reviewerGrid">{reviewerSummary.map(([reviewer, count]) => <span key={reviewer}><b>{reviewer}</b><small>共 {count.total} 条</small><em>✅ {count.within}　⚠️ {count.exceeds}　❓ {count.unsupported}</em></span>)}</div></div>}
        {!!dimensionDistribution.length && <div className="dimensionPanel"><div><strong>问题维度分布</strong><small>严格按建议：仅统计“有标准依据”和“部分相关”的反馈，不计创意建议。</small></div><div className="dimensionBars">{dimensionDistribution.map(([dimension, count]) => <span key={dimension}><b>{dimension}</b><i><em style={{ width: `${Math.round((count / Math.max(1, opinionSummary.within + opinionSummary.exceeds)) * 100)}%` }} /></i><small>{count}</small></span>)}</div></div>}
        <div className="opinionTable">
          <div className="opinionHead"><span>序号</span><span>反馈人</span><span>反馈内容摘要</span><span>对应维度</span><span>对应条款</span><span>判定</span><span>建议等级</span><span>说明</span></div>
          {!opinions.length ? <div className="emptyIssues"><span>◎</span><strong>上传或输入审核意见后开始比对</strong><small>系统会自动标记超出标准与缺少依据的意见</small></div> : opinions.map((opinion) => (
            <div className={`opinionRow ${opinion.status}`} key={opinion.id}>
              <div className="opinionSequence"><b>{opinion.sequence || opinion.id}</b><small>{opinion.id}</small></div>
              <div className="opinionReviewer">{opinion.reviewer || "未注明"}<small>{opinion.timecode || "无时间码"}</small></div>
              <div className="opinionText">{opinion.summary || "待生成"}<small title={opinion.text}>原文：{opinion.text}</small></div>
              <div className="opinionDimension">{opinion.dimension || "待分类"}</div>
              <div className="opinionBasis"><b>{opinion.clauseId || "待匹配"}</b><small>{opinion.basis || "尚未匹配标准"}</small></div>
              <div className="opinionDecision"><select value={opinion.status} onChange={(event) => setOpinions((current) => current.map((item) => item.id === opinion.id ? { ...item, status: event.target.value as OpinionStatus, severity: event.target.value === "unsupported" || event.target.value === "pending" ? "" : item.severity } : item))} aria-label={`${opinion.id}审核结论`}>
                {(["within", "exceeds", "unsupported", "pending"] as OpinionStatus[]).map((key) => <option key={key} value={key}>{opinionStatusText[key]}</option>)}
              </select></div>
              <div className="opinionLevel">{opinion.severity ? <span className={`badge ${opinion.severity}`}>{severityText[opinion.severity]}</span> : "—"}</div>
              <div className="opinionReason">{opinion.reason || "点击“逐条校验全部意见”开始判断。"}</div>
            </div>
          ))}
        </div>
        {!!opinionSummary.unsupported && <div className="creativePanel"><div><strong>创意建议汇总</strong><small>超出审核标准的反馈仅供编导参考决定是否采纳，不进入标准性修改清单。</small></div>{opinions.filter((item) => item.status === "unsupported").map((item) => <span key={item.id}><b>#{item.sequence}</b><em>{item.reviewer || "未注明反馈人"}</em>{item.text}</span>)}</div>}
      </section>

      <section className="modelSection">
        <div className="modelIntro"><span className="sectionLabel">06 · 大模型协同窗口</span><h2>调用模型复核标准边界</h2><p>只发送审核标准、审核意见、视频元数据和本地质检结果；不会发送原视频。API 凭证仅保存在当前页面内存中。</p></div>
        <div className="modelConsole">
          <div className="modelConfig"><input value={apiEndpoint} onChange={(e) => setApiEndpoint(e.target.value)} placeholder="OpenAI 兼容 API 地址，例如 https://…/v1/chat/completions" /><input value={apiModel} onChange={(e) => setApiModel(e.target.value)} placeholder="模型名称" /><input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder="临时 API Key（不会保存）" /></div>
          <textarea className="modelQuestion" value={modelQuestion} onChange={(e) => setModelQuestion(e.target.value)} aria-label="模型审核任务" />
          <div className="modelActions"><button className="softButton" onClick={() => navigator.clipboard.writeText(JSON.stringify(buildModelPayload(), null, 2))}>复制完整调用上下文</button><button className="analyzeButton compactAction" onClick={callModel} disabled={modelRunning}>{modelRunning ? "模型复核中…" : "调用大模型复核"}</button></div>
          <pre>{modelReply || "模型返回内容将显示在这里；符合 JSON 格式的判断会自动回写到上方意见表。"}</pre>
        </div>
      </section>

      <section className="reportSection">
        <div className="resultHeader"><div><span className="sectionLabel">07 · 视频自动质检</span><h2>问题时间线</h2></div></div>
        <div className="summaryGrid">
          {(["red", "yellow", "green"] as Severity[]).map((severity) => <button key={severity} className={`summaryCard ${severity} ${activeFilter === severity ? "active" : ""}`} onClick={() => setActiveFilter(activeFilter === severity ? "all" : severity)}><span>{severityText[severity]}</span><strong>{summary[severity]}</strong><small>{severity === "red" ? "阻断交付" : severity === "yellow" ? "建议复核" : "记录即可"}</small></button>)}
        </div>
        <div className="issueList">
          {!filteredIssues.length ? <div className="emptyIssues"><span>◎</span><strong>视频问题将在这里按时间码排列</strong><small>点击问题项可跳转到对应位置</small></div> : filteredIssues.map((issue, index) => <button key={issue.id} className="issueRow" onClick={() => jumpTo(issue)}><span className={`severityDot ${issue.severity}`} /><span className="issueIndex">{String(index + 1).padStart(2, "0")}</span><span className="issueTime">{formatTime(issue.start)}<small>— {formatTime(issue.end)}</small></span><span className="issueBody"><b>{issue.title}</b><small>{issue.category} · {issue.detail}</small><em>{issue.suggestion}</em></span><span className={`badge ${issue.severity}`}>{severityText[issue.severity]}</span><span className="jump">↗</span></button>)}
        </div>
      </section>

      <footer><span>FRAMECHECK · AI 视频审核工作台</span><span>自动判断用于辅助审核，最终结论应由业务负责人确认。</span></footer>
    </main>
  );
}
