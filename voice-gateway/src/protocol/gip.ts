/**
 * 火山大模型流式 ASR（bigmodel_async）WebSocket 二进制协议帧编解码。
 *
 * 协议要点（openspeech.bytedance.com/api/v3/sauc/bigmodel_async）：
 * 客户端 → 服务端 的音频/控制帧用自定义二进制头（GIP header），结构如下：
 *
 *   byte 0:      payload type (1=audio/json, 之后扩)
 *   byte 1:      sequence number (seq)
 *   byte 2:      last packet flag (0=否, 1=本条消息最后一包)
 *   byte 3:      reserved (0)
 *   byte 4..7:   payload size (uint32, big-endian)
 *   byte 8..11:  compressed size (uint32, big-endian) —— 实际未压缩时填 payload size
 *   byte 12..15: reserved (0)
 *   byte 16..:   payload (音频 PCM / gzip 后的 JSON 控制消息)
 *
 * 注意：本文件只实现「编码客户端帧」与「解码服务端文本帧」。服务端返回的是
 * 普通文本帧（JSON 字符串），无需二进制解析。所有带 ⚠️ 的字段在联调时
 * 需对照火山官方文档逐字节核对（无 key 阶段无法端到端验证，先留好钩子）。
 */

export const GIP_HEADER_SIZE = 16;

export enum PayloadType {
  /** JSON 控制消息（start/finish 等），可 gzip */
  JSON = 1,
  /** 二进制音频（16k 单声道 PCM） */
  AUDIO = 2,
}

export enum CompressType {
  NONE = 0,
  GZIP = 1,
}

/** 编码一帧客户端 → 服务端 的二进制数据 */
export function encodeClientFrame(opts: {
  payload: Buffer;
  payloadType: PayloadType;
  seq: number;
  isLast: boolean;
  compress: CompressType;
}): Buffer {
  const { payload, payloadType, seq, isLast, compress } = opts;
  const header = Buffer.alloc(GIP_HEADER_SIZE);
  header.writeUInt8(payloadType, 0);
  header.writeUInt8(seq & 0xff, 1);
  header.writeUInt8(isLast ? 1 : 0, 2);
  header.writeUInt8(0, 3); // reserved
  header.writeUInt32BE(payload.length, 4); // payload size
  header.writeUInt32BE(payload.length, 8); // compressed size（未压缩时等于 payload size）
  header.writeUInt32BE(0, 12); // reserved
  return Buffer.concat([header, payload]);
}

/** 把控制消息对象编码成 gzip 后的 JSON 帧（火山 start/finish 用 JSON 控制） */
export function encodeControlFrame(obj: unknown, seq: number, gzip: (b: Buffer) => Buffer): Buffer {
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  const compressed = gzip(json);
  return encodeClientFrame({
    payload: compressed,
    payloadType: PayloadType.JSON,
    seq,
    isLast: true,
    compress: CompressType.GZIP,
  });
}

/** 把一包 PCM 音频编码成音频帧（不压缩） */
export function encodeAudioFrame(pcm: Buffer, seq: number, isLast = false): Buffer {
  return encodeClientFrame({
    payload: pcm,
    payloadType: PayloadType.AUDIO,
    seq,
    isLast,
    compress: CompressType.NONE,
  });
}
