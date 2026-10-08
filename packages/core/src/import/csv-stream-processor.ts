/**
 * CSV Stream Processor Utility
 *
 * Provides chunked and streaming CSV processing to avoid Node.js memory exhaustion
 * when importing large CSV files (e.g. 50,000+ rows).
 */

import { Readable } from 'node:stream';
import Papa from 'papaparse';
import { ImportError } from './types.js';

export interface StreamProcessOptions<T> {
  chunkSize?: number;
  skipEmptyRows?: boolean;
  onChunk?: (records: T[], chunkIndex: number) => Promise<void> | void;
  maxRows?: number;
}

export interface StreamParseSummary<T> {
  totalRows: number;
  headers: string[];
  sampleRecords: T[];
  errors: ImportError[];
}

interface StreamParserState<T> {
  totalRows: number;
  chunkIndex: number;
  currentChunk: T[];
  sampleRecords: T[];
  headers: string[];
  errors: ImportError[];
}

function collectParseErrors(errors: ImportError[], parseErrors: Papa.ParseError[]): void {
  for (const err of parseErrors) {
    errors.push({
      row: typeof err.row === 'number' ? err.row + 1 : 0,
      message: `CSV syntax error: ${err.message}`,
      severity: 'ERROR',
    });
  }
}

async function flushChunk<T>(
  state: StreamParserState<T>,
  parser: Papa.Parser,
  onChunk?: (records: T[], chunkIndex: number) => Promise<void> | void
): Promise<void> {
  parser.pause();
  const chunkToProcess = state.currentChunk;
  state.currentChunk = [];
  try {
    if (onChunk !== undefined) {
      await onChunk(chunkToProcess, state.chunkIndex++);
    }
    parser.resume();
  } catch (err) {
    parser.abort();
    throw err;
  }
}

function createStreamFromInput(input: Buffer | Readable | string): Readable {
  if (input instanceof Readable) {
    return input;
  }
  const text = Buffer.isBuffer(input) ? input.toString('utf-8') : input;
  return Readable.from(text);
}

interface StreamContext<T> {
  stream: Readable;
  state: StreamParserState<T>;
  options: StreamProcessOptions<T>;
  chunkSize: number;
  maxRows: number;
}

async function handleStreamChunk<T extends Record<string, unknown>>(
  results: Papa.ParseResult<T>,
  parser: Papa.Parser,
  ctx: StreamContext<T>
): Promise<void> {
  if (ctx.state.headers.length === 0 && results.meta.fields !== undefined) {
    ctx.state.headers = results.meta.fields;
  }
  if (results.errors.length > 0) {
    collectParseErrors(ctx.state.errors, results.errors);
  }
  for (const row of results.data) {
    ctx.state.totalRows++;
    ctx.state.currentChunk.push(row);
    if (ctx.state.sampleRecords.length < 50) {
      ctx.state.sampleRecords.push(row);
    }
    if (ctx.state.currentChunk.length >= ctx.chunkSize) {
      await flushChunk(ctx.state, parser, ctx.options.onChunk);
    }
    if (ctx.state.totalRows >= ctx.maxRows) {
      parser.abort();
      break;
    }
  }
}

async function handleStreamComplete<T>(
  ctx: StreamContext<T>,
  resolve: (summary: StreamParseSummary<T>) => void,
  reject: (err: unknown) => void
): Promise<void> {
  try {
    if (ctx.state.currentChunk.length > 0 && ctx.options.onChunk !== undefined) {
      await ctx.options.onChunk(ctx.state.currentChunk, ctx.state.chunkIndex++);
    }
    resolve({
      totalRows: ctx.state.totalRows,
      headers: ctx.state.headers,
      sampleRecords: ctx.state.sampleRecords,
      errors: ctx.state.errors,
    });
  } catch (err) {
    reject(err);
  }
}

function parseStreamWithPapa<T extends Record<string, unknown>>(
  ctx: StreamContext<T>
): Promise<StreamParseSummary<T>> {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(ctx.stream, {
      header: true,
      skipEmptyLines: ctx.options.skipEmptyRows ?? true ? 'greedy' : false,
      dynamicTyping: false,
      chunk: (results, parser) => {
        void handleStreamChunk(results, parser, ctx).catch(reject);
      },
      complete: () => {
        void handleStreamComplete(ctx, resolve, reject).catch(reject);
      },
      error: (err: Error) => {
        reject(err);
      },
    });
  });
}

/**
 * Process a CSV buffer or Readable stream in bounded chunks.
 * Reads records incrementally to preserve Node.js memory.
 */
export async function processCsvInChunks<T extends Record<string, unknown>>(
  input: Buffer | Readable | string,
  options: StreamProcessOptions<T> = {}
): Promise<StreamParseSummary<T>> {
  const chunkSize = options.chunkSize ?? 250;
  const maxRows = options.maxRows ?? 50000;

  const state: StreamParserState<T> = {
    totalRows: 0,
    chunkIndex: 0,
    currentChunk: [],
    sampleRecords: [],
    headers: [],
    errors: [],
  };

  const stream = createStreamFromInput(input);
  return parseStreamWithPapa({ stream, state, options, chunkSize, maxRows });
}
