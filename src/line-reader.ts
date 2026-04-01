import type { Readable } from "node:stream";
import { TextDecoder } from "node:util";

export interface OversizedLine {
  lineNumber: number;
  byteLength: number;
}

export interface ReadLinesOptions {
  stream: Readable;
  maxLineBytes: number;
  binarySampleBytes?: number;
  forceText?: boolean;
  onLine: (line: string, lineNumber: number) => void | Promise<void>;
}

export interface ReadLinesResult {
  kind: "text" | "binary" | "decode_error";
  oversizedLines: OversizedLine[];
  decodeError?: string;
}

export async function readLinesFromStream(
  options: ReadLinesOptions,
): Promise<ReadLinesResult> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const oversizedLines: OversizedLine[] = [];
  const binarySampleBytes = options.binarySampleBytes ?? 8192;
  let sampleBytesRead = 0;
  let lineNumber = 1;
  let lineChunks: Buffer[] = [];
  let lineBytes = 0;
  let lineTooLong = false;
  let lineTooLongBytes = 0;

  const finishLine = async (): Promise<void> => {
    if (lineTooLong) {
      oversizedLines.push({
        lineNumber,
        byteLength: lineTooLongBytes,
      });
    } else {
      const lineBuffer =
        lineBytes === 0 ? Buffer.alloc(0) : Buffer.concat(lineChunks, lineBytes);
      let line = decoder.decode(lineBuffer);

      if (line.endsWith("\r")) {
        line = line.slice(0, -1);
      }

      await options.onLine(line, lineNumber);
    }

    lineNumber += 1;
    lineChunks = [];
    lineBytes = 0;
    lineTooLong = false;
    lineTooLongBytes = 0;
  };

  const appendSegment = (segment: Buffer): void => {
    if (segment.length === 0) {
      return;
    }

    if (lineTooLong) {
      lineTooLongBytes += segment.length;
      return;
    }

    const nextLineBytes = lineBytes + segment.length;

    if (nextLineBytes > options.maxLineBytes) {
      lineTooLong = true;
      lineTooLongBytes = nextLineBytes;
      lineChunks = [];
      lineBytes = 0;
      return;
    }

    lineChunks.push(segment);
    lineBytes = nextLineBytes;
  };

  try {
    for await (const chunkValue of options.stream) {
      const chunk = Buffer.isBuffer(chunkValue)
        ? chunkValue
        : Buffer.from(chunkValue);

      if (!options.forceText && sampleBytesRead < binarySampleBytes) {
        const sampleEnd = Math.min(
          chunk.length,
          binarySampleBytes - sampleBytesRead,
        );
        const sample = chunk.subarray(0, sampleEnd);

        if (sample.includes(0)) {
          if (typeof options.stream.destroy === "function") {
            options.stream.destroy();
          }

          return {
            kind: "binary",
            oversizedLines,
          };
        }

        sampleBytesRead += sample.length;
      }

      let segmentStart = 0;

      while (segmentStart < chunk.length) {
        const newlineIndex = chunk.indexOf(0x0a, segmentStart);

        if (newlineIndex === -1) {
          appendSegment(chunk.subarray(segmentStart));
          break;
        }

        appendSegment(chunk.subarray(segmentStart, newlineIndex));
        await finishLine();
        segmentStart = newlineIndex + 1;
      }
    }

    if (lineTooLong || lineBytes > 0) {
      await finishLine();
    }

    return {
      kind: "text",
      oversizedLines,
    };
  } catch (error) {
    return {
      kind: "decode_error",
      oversizedLines,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}
