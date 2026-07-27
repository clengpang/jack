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
  timecode: string;
  text: string;
  reviewer: string;
  status: OpinionStatus;
  basis: string;
  reason: string;
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
  within: "标准内",
  exceeds: "超出标准",
  unsupported: "缺少依据",
  pending: "待判断",
};

const defaultStandard = `【基础技术｜必须改】黑帧、白帧、夹帧、卡顿、画面比例错误必须修改。
【角色一致性｜必须改】主角发色、服装、体型发生明显变化必须修改；配角轻微差异可接受。
【穿帮连续性｜必须改】主角明显穿帮必须修改；配角微小穿帮建议修改。
【光影｜建议改】同一场景光源反转必须修改；正常场景差异可接受。
【画面变形｜必须改】主角脸部或肢体明显拉伸必须修改；背景轻微变形可接受。
【安全构图｜必须改】主角脸部、头部被裁切必须修改；设计性半身特写可接受。
【视频节奏｜建议改】音画错位、变身卡顿必须修改；单页时长轻微偏差建议调整。
【补帧流畅度｜必须改】明显闪烁、跳帧、低帧率必须修改；静态画面可接受。
【转场｜建议改】场景变化无转场造成迷惑必须修改；转场时长轻微差异可接受。`;

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
  } catch {
    rows = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const cells = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((v) => v.replace(/^"|"$/g, "").trim());
        return cells.length >= 3
          ? { timecode: cells[0], reviewer: cells[1], text: cells.slice(2).join("，") }
          : { text: line };
      });
  }
  return rows
    .map((row, index) => {
      const text = String(row.text ?? row.审核意见 ?? row.意见 ?? row.content ?? "").trim();
      const inlineTime = text.match(/\b\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?\b/)?.[0] ?? "";
      return {
        id: String(row.id ?? `OP-${String(index + 1).padStart(3, "0")}`),
        timecode: String(row.timecode ?? row.时间码 ?? inlineTime),
        text,
        reviewer: String(row.reviewer ?? row.审核人 ?? row.反馈人员 ?? ""),
        status: "pending" as OpinionStatus,
        basis: "",
        reason: "",
      };
    })
    .filter((item) => item.text);
};

const compareOpinion = (opinion: Opinion, standardLines: string[]): Opinion => {
  const terms = extractTerms(opinion.text);
  let best = "";
  let bestScore = 0;
  for (const line of standardLines) {
    const standardTerms = new Set(extractTerms(line));
    const score = terms.filter((term) => standardTerms.has(term)).length;
    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  }
  if (!best || bestScore < 1) {
    return {
      ...opinion,
      status: "unsupported",
      basis: "",
      reason: "未在当前审核标准中找到足够接近的条款，建议补充依据后再要求修改。",
    };
  }
  const strongRequest = /必须|一律|全部|完全|统一|重做|推翻|不能|严禁/.test(opinion.text);
  const weakStandard = /建议|可接受|轻微|不影响/.test(best) && !/必须改/.test(best);
  if (strongRequest && weakStandard) {
    return {
      ...opinion,
      status: "exceeds",
      basis: best,
      reason: "审核意见使用了强制性要求，但匹配标准仅为建议或可接受范围。",
    };
  }
  return {
    ...opinion,
    status: "within",
    basis: best,
    reason: "审核意见与现有标准存在明确对应关系。",
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
          const pageText = content.items
            .map((item) => "str" in item ? item.str : "")
            .join(" ");
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
        setOpinions((current) => [...current, ...parseOpinions(text)]);
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
        timecode: text.match(/\b\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?\b/)?.[0] ?? "",
        text,
        reviewer: "手动输入",
        status: "pending",
        basis: "",
        reason: "",
      },
    ]);
    setOpinionDraft("");
  };

  const runOpinionComparison = () => {
    setOpinions((current) => current.map((item) => compareOpinion(item, standardLines)));
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
      setOpinions((current) => current.map((item) => compareOpinion(item, standardLines)));
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
    instructions: "逐条判断审核意见是否在标准内、是否超出标准、或缺少依据。只返回JSON数组，字段为id,status,basis,reason；status仅允许within/exceeds/unsupported。",
    review_standard: standardLines,
    review_opinions: opinions.map(({ id, timecode, text, reviewer }) => ({ id, timecode, text, reviewer })),
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
            { role: "system", content: "你是严格但尊重标准边界的视频审核专家。" },
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
            return { ...item, status: nextStatus, basis: String(match.basis ?? ""), reason: String(match.reason ?? "") };
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
          auto_qc: issues,
          opinion_summary: opinionSummary,
          annotated_opinions: opinions,
          model_reply: modelReply,
        }, null, 2),
        "application/json",
        `${fileBase}-综合审核报告.json`,
      );
      return;
    }
    const headers = ["意见ID", "时间码", "审核人", "审核意见", "标注结论", "匹配标准", "判断原因"];
    const rows = opinions.map((item) => [
      item.id,
      item.timecode,
      item.reviewer,
      item.text,
      opinionStatusText[item.status],
      item.basis,
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
          <span className="eyebrow">AI REVIEW OPERATING SYSTEM</span>
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
          <div className="intakeTitle"><strong>审核标准资料</strong><span>{standardDocs.length} 个文件 · {standardLines.length} 条规则</span></div>
          <label className="multiUpload" htmlFor="standard-file-input">
            <span>＋</span><strong>批量上传标准文件</strong><small>PDF、图片、TXT、MD、CSV、JSON</small>
          </label>
          <input id="standard-file-input" ref={standardInputRef} className="hiddenInput" type="file" multiple accept=".pdf,image/*,.txt,.md,.csv,.tsv,.json" onChange={(event) => onDocuments(event, "standard")} />
          {renderDocs(standardDocs)}
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
          <input id="opinion-file-input" ref={opinionInputRef} className="hiddenInput" type="file" multiple accept=".pdf,image/*,.txt,.md,.csv,.tsv,.json" onChange={(event) => onDocuments(event, "opinion")} />
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
          <input id="video-file-input" ref={videoInputRef} className="hiddenInput" type="file" accept="video/*" onChange={onVideoFile} />
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
            <span className={standardLines.length ? "ready" : ""}>审核标准 <b>{standardLines.length ? "已就绪" : "缺失"}</b></span>
            <span className={opinions.length ? "ready" : ""}>审核意见 <b>{opinions.length ? `${opinions.length} 条` : "缺失"}</b></span>
            <span className={videoFile ? "ready" : ""}>视频素材 <b>{videoFile ? "已就绪" : "缺失"}</b></span>
          </div>
          <label className="rangeRow"><span>采样间隔 <b>{sampleSeconds.toFixed(1)}s</b></span><input type="range" min="0.25" max="2" step="0.25" value={sampleSeconds} onChange={(e) => setSampleSeconds(Number(e.target.value))} /></label>
          <label className="rangeRow"><span>黑帧阈值 <b>{blackThreshold}</b></span><input type="range" min="4" max="30" step="1" value={blackThreshold} onChange={(e) => setBlackThreshold(Number(e.target.value))} /></label>
          <label className="rangeRow"><span>静帧灵敏度 <b>{freezeThreshold.toFixed(1)}</b></span><input type="range" min="0.8" max="6" step="0.2" value={freezeThreshold} onChange={(e) => setFreezeThreshold(Number(e.target.value))} /></label>
          <button className="secondaryAction" disabled={!opinions.length || !standardLines.length} onClick={runOpinionComparison}>仅比对标准与意见</button>
          <button className="analyzeButton" disabled={!videoFile || !standardLines.length || running} onClick={analyzeVideo}>{running ? "正在综合审核…" : "开始视频综合审核"}</button>
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
          {(["within", "exceeds", "unsupported", "pending"] as OpinionStatus[]).map((key) => <div className={`opinionSummary ${key}`} key={key}><span>{opinionStatusText[key]}</span><strong>{opinionSummary[key]}</strong></div>)}
        </div>
        <div className="opinionTable">
          <div className="opinionHead"><span>ID / 时间码</span><span>原始审核意见</span><span>匹配标准与判断</span><span>结论</span></div>
          {!opinions.length ? <div className="emptyIssues"><span>◎</span><strong>上传或输入审核意见后开始比对</strong><small>系统会自动标记超出标准与缺少依据的意见</small></div> : opinions.map((opinion) => (
            <div className={`opinionRow ${opinion.status}`} key={opinion.id}>
              <div className="opinionMeta"><b>{opinion.id}</b><span>{opinion.timecode || "无时间码"}</span><small>{opinion.reviewer || "未注明审核人"}</small></div>
              <div className="opinionText">{opinion.text}</div>
              <div className="opinionBasis"><b>{opinion.basis || "尚未匹配标准"}</b><small>{opinion.reason || "点击“仅比对标准与意见”开始判断。"}</small></div>
              <select value={opinion.status} onChange={(event) => setOpinions((current) => current.map((item) => item.id === opinion.id ? { ...item, status: event.target.value as OpinionStatus } : item))} aria-label={`${opinion.id}审核结论`}>
                {(["within", "exceeds", "unsupported", "pending"] as OpinionStatus[]).map((key) => <option key={key} value={key}>{opinionStatusText[key]}</option>)}
              </select>
            </div>
          ))}
        </div>
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
