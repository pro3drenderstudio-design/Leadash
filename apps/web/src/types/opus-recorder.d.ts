/** opus-recorder ships no type declarations — minimal surface for what we use. */
declare module "opus-recorder" {
  interface RecorderOptions {
    encoderPath?:        string;
    encoderSampleRate?:  number;
    encoderApplication?: number;
    numberOfChannels?:   number;
    streamPages?:        boolean;
  }

  export default class Recorder {
    constructor(options?: RecorderOptions);
    ondataavailable: (buffer: ArrayBuffer) => void;
    onstart:  () => void;
    onstop:   () => void;
    onpause:  () => void;
    onresume: () => void;
    start(): Promise<void>;
    stop(): void;
    pause(): void;
    resume(): void;
    close(): void;
  }
}
