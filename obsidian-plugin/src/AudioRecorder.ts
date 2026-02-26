/**
 * AudioRecorder - Handles audio recording using the MediaRecorder API
 * Designed for Obsidian plugin environment
 *
 * Supports three capture strategies:
 *   1. full_call (speakerphone) -- disables echo cancellation so the mic
 *      naturally picks up the other person's voice from laptop speakers.
 *   2. virtual_device -- captures from a virtual audio loopback device
 *      (BlackHole / VB-Cable) for clean system-audio capture, mixed with
 *      the physical mic via Web Audio API.
 *   3. mic_only -- traditional single-mic recording with echo cancellation.
 */

export type AudioCaptureMode = 'full_call' | 'mic_only';
export type SystemAudioMethod = 'virtual_device' | 'electron' | 'display_media' | null;

export interface AudioRecordingOptions {
  captureMode: AudioCaptureMode;
  micDeviceId?: string;
  systemAudioDeviceId?: string;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioLevel: number;
}

export interface RecordingResult {
  audioBlob: Blob;
  duration: number;
  mimeType: string;
  filename: string;
  captureMode: AudioCaptureMode;
  hasVirtualDevice: boolean;
  systemAudioMethod: SystemAudioMethod;
}

export interface AudioDiagnostic {
  hasAudio: boolean;
  averageLevel: number;
  peakLevel: number;
  silentPercent: number;
  warning: string | null;
}

export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  isVirtual: boolean;
}

export interface SystemAudioProbeResult {
  electronAvailable: boolean;
  desktopCapturerAvailable: boolean;
  desktopCapturerSources: number;
  remoteAvailable: boolean;
  remoteSessionAvailable: boolean;
  ipcRendererAvailable: boolean;
  getDisplayMediaAvailable: boolean;
  electronVersion: string | null;
  chromiumVersion: string | null;
  platform: string;
  handlerSetupResult: string;
  bestPath: string;
}

export type RecordingLifecycleEvent =
  | { type: 'deviceChanged'; newDevices: AudioDeviceInfo[]; activeDeviceLost: boolean }
  | { type: 'headphoneDetected'; deviceLabel: string }
  | { type: 'silenceDetected'; durationSeconds: number }
  | { type: 'audioRestored' }
  | { type: 'permissionError'; error: string };

export type RecordingStateCallback = (state: RecordingState) => void;
export type RecordingEventCallback = (event: RecordingLifecycleEvent) => void;

const VIRTUAL_DEVICE_PATTERNS = [
  /blackhole/i, /vb-cable/i, /vb cable/i,
  /loopback/i, /soundflower/i, /virtual audio/i,
  /screen ?capture/i
];

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private secondaryStream: MediaStream | null = null;
  private startTime: number = 0;
  private pausedDuration: number = 0;
  private pauseStartTime: number = 0;
  private durationInterval: NodeJS.Timeout | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelInterval: NodeJS.Timeout | null = null;
  
  private lastExtractedChunkIndex: number = 0;
  private mimeTypeCache: string = 'audio/webm';

  private activeCaptureMode: AudioCaptureMode = 'full_call';
  private activeHasVirtualDevice: boolean = false;
  private activeSystemAudioMethod: SystemAudioMethod = null;
  
  private state: RecordingState = {
    isRecording: false,
    isPaused: false,
    duration: 0,
    audioLevel: 0
  };
  
  private stateCallback: RecordingStateCallback | null = null;
  private eventCallback: RecordingEventCallback | null = null;

  // Device monitoring
  private deviceChangeHandler: (() => void) | null = null;
  private activeDeviceLabel: string = '';

  // Silence watchdog
  private silenceCheckInterval: NodeJS.Timeout | null = null;
  private consecutiveSilentChecks: number = 0;
  private silenceAlerted: boolean = false;
  private static readonly SILENCE_THRESHOLD = 5;
  private static readonly SILENCE_ALERT_AFTER = 6; // 6 checks * 5s = 30 seconds

  // Headphone detection
  private static readonly HEADPHONE_PATTERNS = [
    /airpods/i, /beats/i, /headphone/i, /headset/i, /earbuds/i,
    /bluetooth/i, /bose/i, /sony wh/i, /jabra/i, /galaxy buds/i
  ];

  /**
   * Set callback for state updates (duration, audio levels, etc.)
   */
  onStateChange(callback: RecordingStateCallback): void {
    this.stateCallback = callback;
  }

  /**
   * Set callback for lifecycle events (device changes, silence, errors)
   */
  onEvent(callback: RecordingEventCallback): void {
    this.eventCallback = callback;
  }

  private emitEvent(event: RecordingLifecycleEvent): void {
    if (this.eventCallback) {
      try { this.eventCallback(event); } catch (e) { console.error('[AudioRecorder] Event handler error:', e); }
    }
  }

  /**
   * Check if a device label indicates headphones/earbuds
   */
  static isHeadphoneDevice(label: string): boolean {
    if (!label) return false;
    return AudioRecorder.HEADPHONE_PATTERNS.some(p => p.test(label));
  }

  /**
   * Detect if running on iOS/Safari
   */
  private static isIOSOrSafari(): boolean {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    return isIOS || isSafari;
  }

  /**
   * Get supported MIME type for recording
   * iOS/Safari has limited MediaRecorder support - prioritize mp4/m4a formats
   */
  private getSupportedMimeType(): string {
    // iOS/Safari prefer mp4 format
    const isIOSSafari = AudioRecorder.isIOSOrSafari();
    
    // Prioritize formats based on platform
    const types = isIOSSafari ? [
      'audio/mp4',           // iOS Safari primary
      'audio/mp4;codecs=aac',
      'audio/aac',
      'audio/webm;codecs=opus',
      'audio/webm'
    ] : [
      'audio/webm;codecs=opus',  // Desktop/Chrome primary
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];
    
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log(`[AudioRecorder] Using MIME type: ${type} (iOS/Safari: ${isIOSSafari})`);
        return type;
      }
    }
    
    // Default fallback based on platform
    return isIOSSafari ? 'audio/mp4' : 'audio/webm';
  }

  /**
   * Request microphone access and start recording.
   * @param options - capture mode and optional explicit device IDs
   */
  async startRecording(options?: AudioRecordingOptions): Promise<void> {
    if (this.state.isRecording) {
      throw new Error('Already recording');
    }

    const captureMode = options?.captureMode ?? 'full_call';
    this.activeCaptureMode = captureMode;
    this.activeHasVirtualDevice = false;
    this.activeSystemAudioMethod = null;

    try {
      const isIOSSafari = AudioRecorder.isIOSOrSafari();

      // --- Build mic constraints based on capture mode ---
      let audioConstraints: MediaTrackConstraints;

      if (isIOSSafari) {
        audioConstraints = { echoCancellation: true, noiseSuppression: true };
      } else if (captureMode === 'full_call') {
        audioConstraints = {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1
        };
      } else {
        audioConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1
        };
      }

      if (options?.micDeviceId) {
        audioConstraints.deviceId = { exact: options.micDeviceId };
      }

      const micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      console.log(`[AudioRecorder] Mic granted | mode=${captureMode} | echoCancellation=${captureMode !== 'full_call'}`);

      // --- Virtual audio device: dual-stream mixing ---
      let finalStream = micStream;

      const systemDeviceId = options?.systemAudioDeviceId
        || (await AudioRecorder.detectVirtualAudioDevice())?.deviceId;

      if (systemDeviceId && !isIOSSafari) {
        try {
          const systemStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: systemDeviceId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
            }
          });

          this.audioContext = new AudioContext();
          const micSource = this.audioContext.createMediaStreamSource(micStream);
          const sysSource = this.audioContext.createMediaStreamSource(systemStream);
          const destination = this.audioContext.createMediaStreamDestination();
          micSource.connect(destination);
          sysSource.connect(destination);
          finalStream = destination.stream;

          this.secondaryStream = systemStream;
          this.activeHasVirtualDevice = true;
          this.activeSystemAudioMethod = 'virtual_device';
          console.log('[AudioRecorder] Virtual device detected — dual-stream capture active');
        } catch (vdErr: any) {
          console.log(`[AudioRecorder] Virtual device open failed (${vdErr.message}), continuing with mic only`);
        }
      }

      // --- Native system audio: try Electron/getDisplayMedia when no virtual device ---
      if (!this.activeHasVirtualDevice && captureMode === 'full_call' && !isIOSSafari) {
        try {
          console.log('[AudioRecorder] No virtual device — attempting native system audio capture');
          const systemResult = await AudioRecorder.captureSystemAudio();
          if (systemResult) {
            this.audioContext = this.audioContext || new AudioContext();
            const micSrc = this.audioContext.createMediaStreamSource(micStream);
            const sysSrc = this.audioContext.createMediaStreamSource(systemResult.stream);
            const dest = this.audioContext.createMediaStreamDestination();
            micSrc.connect(dest);
            sysSrc.connect(dest);
            finalStream = dest.stream;

            this.secondaryStream = systemResult.stream;
            this.activeHasVirtualDevice = true;
            this.activeSystemAudioMethod = systemResult.method;
            console.log(`[AudioRecorder] Native system audio via ${systemResult.method} — dual-stream active`);
          }
        } catch (sysErr: any) {
          console.log(`[AudioRecorder] Native system audio failed (${sysErr.message}), continuing with mic only`);
        }
      }

      this.stream = finalStream;

      this.setupAudioAnalysis();

      const mimeType = this.getSupportedMimeType();
      this.mimeTypeCache = mimeType;
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 128000
      });

      this.audioChunks = [];
      this.lastExtractedChunkIndex = 0;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(1000);

      this.startTime = Date.now();
      this.pausedDuration = 0;

      this.state = {
        isRecording: true,
        isPaused: false,
        duration: 0,
        audioLevel: 0
      };

      this.startDurationTracking();
      this.startLevelTracking();
      this.startLevelHistoryTracking();
      this.captureActiveDeviceLabel(finalStream);
      this.startDeviceMonitoring();
      this.startSilenceWatchdog();
      this.notifyStateChange();

    } catch (error) {
      this.cleanup();
      throw new Error(`Failed to start recording: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEVICE DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Scan audio inputs for a known virtual audio loopback device.
   * Returns the first match or null.
   */
  static async detectVirtualAudioDevice(): Promise<AudioDeviceInfo | null> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      for (const d of devices) {
        if (d.kind !== 'audioinput') continue;
        for (const pattern of VIRTUAL_DEVICE_PATTERNS) {
          if (pattern.test(d.label)) {
            return { deviceId: d.deviceId, label: d.label, isVirtual: true };
          }
        }
      }
    } catch (e) {
      console.warn('[AudioRecorder] enumerateDevices failed:', e);
    }
    return null;
  }

  /**
   * List all audio input devices, annotating known virtual devices.
   */
  static async getAvailableDevices(): Promise<AudioDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter(d => d.kind === 'audioinput')
        .map(d => {
          const isVirtual = VIRTUAL_DEVICE_PATTERNS.some(p => p.test(d.label));
          return { deviceId: d.deviceId, label: d.label || 'Unknown Microphone', isVirtual };
        });
    } catch (e) {
      console.warn('[AudioRecorder] enumerateDevices failed:', e);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NATIVE SYSTEM AUDIO CAPTURE — 6-strategy exhaustive approach
  // ═══════════════════════════════════════════════════════════════════════════

  private static _displayMediaHandlerReady = false;

  /**
   * One-time setup: try to install a display media handler via @electron/remote
   * that auto-grants getDisplayMedia with loopback audio (zero user interaction).
   * Call once on plugin load. Subsequent getDisplayMedia calls will auto-grant.
   */
  static async setupDisplayMediaHandler(): Promise<boolean> {
    if (AudioRecorder._displayMediaHandlerReady) return true;

    const electronRequire = (window as any).require;
    if (!electronRequire) return false;

    // Strategy A: @electron/remote (Electron 14+)
    try {
      const remote = electronRequire('@electron/remote');
      if (remote?.session?.defaultSession?.setDisplayMediaRequestHandler && remote?.desktopCapturer?.getSources) {
        remote.session.defaultSession.setDisplayMediaRequestHandler(
          async (request: any, callback: any) => {
            try {
              const sources = await remote.desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
              callback(sources?.length ? { video: sources[0], audio: 'loopback' } : null);
            } catch { callback(null); }
          }
        );
        AudioRecorder._displayMediaHandlerReady = true;
        console.log('[AudioRecorder] Display media handler installed via @electron/remote — loopback audio enabled');
        return true;
      }
    } catch (e: any) {
      console.log(`[AudioRecorder] @electron/remote handler setup failed: ${e.message}`);
    }

    // Strategy B: electron.remote (Electron <14, deprecated)
    try {
      const electron = electronRequire('electron');
      const remote = electron?.remote;
      if (remote?.session?.defaultSession?.setDisplayMediaRequestHandler && remote?.desktopCapturer?.getSources) {
        remote.session.defaultSession.setDisplayMediaRequestHandler(
          async (request: any, callback: any) => {
            try {
              const sources = await remote.desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
              callback(sources?.length ? { video: sources[0], audio: 'loopback' } : null);
            } catch { callback(null); }
          }
        );
        AudioRecorder._displayMediaHandlerReady = true;
        console.log('[AudioRecorder] Display media handler installed via electron.remote — loopback audio enabled');
        return true;
      }
    } catch (e: any) {
      console.log(`[AudioRecorder] electron.remote handler setup failed: ${e.message}`);
    }

    console.log('[AudioRecorder] Could not set up display media handler — remote module not accessible');
    return false;
  }

  /**
   * Strategy 1: desktopCapturer.getSources() + getUserMedia with chromeMediaSource.
   * Zero user interaction. Works if Obsidian's Electron exposes desktopCapturer to the renderer.
   */
  private static async tryDesktopCapturerWithSource(): Promise<MediaStream | null> {
    const electronRequire = (window as any).require;
    if (!electronRequire) return null;

    let sources: any[] | null = null;

    // Sub-strategy 1a: direct require('electron').desktopCapturer
    try {
      const dc = electronRequire('electron')?.desktopCapturer;
      if (dc?.getSources) {
        sources = await dc.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
        if (sources?.length) console.log(`[AudioRecorder] desktopCapturer.getSources: ${sources.length} screen(s)`);
      }
    } catch (e: any) {
      console.log(`[AudioRecorder] direct desktopCapturer failed: ${e.message}`);
    }

    // Sub-strategy 1b: @electron/remote desktopCapturer
    if (!sources?.length) {
      try {
        const dc = electronRequire('@electron/remote')?.desktopCapturer;
        if (dc?.getSources) {
          sources = await dc.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
          if (sources?.length) console.log(`[AudioRecorder] @electron/remote desktopCapturer: ${sources.length} screen(s)`);
        }
      } catch {}
    }

    // Sub-strategy 1c: electron.remote.desktopCapturer
    if (!sources?.length) {
      try {
        const dc = electronRequire('electron')?.remote?.desktopCapturer;
        if (dc?.getSources) {
          sources = await dc.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
          if (sources?.length) console.log(`[AudioRecorder] electron.remote desktopCapturer: ${sources.length} screen(s)`);
        }
      } catch {}
    }

    // Sub-strategy 1d: IPC invoke (Electron 17+ recommended path)
    if (!sources?.length) {
      try {
        const ipc = electronRequire('electron')?.ipcRenderer;
        if (ipc?.invoke) {
          sources = await ipc.invoke('DESKTOP_CAPTURER_GET_SOURCES', { types: ['screen'] });
          if (sources?.length) console.log(`[AudioRecorder] IPC desktopCapturer: ${sources.length} screen(s)`);
        }
      } catch {}
    }

    if (!sources?.length) {
      console.log('[AudioRecorder] No desktopCapturer path yielded sources');
      return null;
    }

    // Now use the source ID to get system audio via getUserMedia + chromeMediaSource
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sources[0].id } } as any,
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sources[0].id, maxWidth: 1, maxHeight: 1, maxFrameRate: 1 } } as any
      });
      stream.getVideoTracks().forEach(t => t.stop());
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        console.log('[AudioRecorder] desktopCapturer + getUserMedia audio capture active');
        return new MediaStream(audioTracks);
      }
    } catch (e: any) {
      console.log(`[AudioRecorder] getUserMedia with chromeMediaSource failed: ${e.message}`);
    }

    return null;
  }

  /**
   * Strategy 2: getUserMedia with chromeMediaSource:'desktop' without a specific source ID.
   * Some Electron versions auto-select the primary screen.
   */
  private static async tryDesktopCapturerNoSourceId(): Promise<MediaStream | null> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'desktop' } } as any,
        video: { mandatory: { chromeMediaSource: 'desktop', maxWidth: 1, maxHeight: 1, maxFrameRate: 1 } } as any
      });
      stream.getVideoTracks().forEach(t => t.stop());
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        console.log('[AudioRecorder] getUserMedia chromeMediaSource:desktop (no source ID) audio active');
        return new MediaStream(audioTracks);
      }
    } catch (e: any) {
      console.log(`[AudioRecorder] chromeMediaSource:desktop (no source) failed: ${e.message}`);
    }
    return null;
  }

  /**
   * Strategy 3: getDisplayMedia — if handler was set up, this auto-grants with loopback audio.
   * If no handler, Electron may show the system picker (macOS 13+) or fail.
   */
  private static async tryGetDisplayMedia(): Promise<MediaStream | null> {
    if (!navigator.mediaDevices?.getDisplayMedia) return null;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: { suppressLocalAudioPlayback: false },
        video: { width: { ideal: 1 }, height: { ideal: 1 }, frameRate: { ideal: 1 } },
        // @ts-ignore — systemAudio not in TS lib types yet
        systemAudio: 'include'
      } as any);

      stream.getVideoTracks().forEach(t => t.stop());
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        console.log(`[AudioRecorder] getDisplayMedia audio capture active (handler=${AudioRecorder._displayMediaHandlerReady})`);
        return new MediaStream(audioTracks);
      }
      console.log('[AudioRecorder] getDisplayMedia returned no audio tracks');
    } catch (e: any) {
      if (e.name === 'NotAllowedError') {
        console.log('[AudioRecorder] getDisplayMedia: not allowed (no handler set or user denied)');
      } else {
        console.log(`[AudioRecorder] getDisplayMedia failed: ${e.name}: ${e.message}`);
      }
    }
    return null;
  }

  /**
   * Master orchestrator: tries every system audio strategy in priority order.
   * Strategies 1-2 are zero-click. Strategy 3 is zero-click IF handler was set up.
   */
  static async captureSystemAudio(): Promise<{ stream: MediaStream; method: 'electron' | 'display_media' } | null> {
    // Strategy 1: desktopCapturer with source ID
    const s1 = await AudioRecorder.tryDesktopCapturerWithSource();
    if (s1) return { stream: s1, method: 'electron' };

    // Strategy 2: chromeMediaSource without source ID
    const s2 = await AudioRecorder.tryDesktopCapturerNoSourceId();
    if (s2) return { stream: s2, method: 'electron' };

    // Strategy 3: getDisplayMedia (auto-grants if handler was set up)
    const s3 = await AudioRecorder.tryGetDisplayMedia();
    if (s3) return { stream: s3, method: 'display_media' };

    console.log('[AudioRecorder] All system audio strategies exhausted — mic only');
    return null;
  }

  /**
   * Comprehensive diagnostic — tests every Electron access path and reports what's available.
   * Safe to call from settings or commands (no audio capture started).
   */
  static async probeSystemAudioCapabilities(): Promise<SystemAudioProbeResult> {
    const result: SystemAudioProbeResult = {
      electronAvailable: false,
      desktopCapturerAvailable: false,
      desktopCapturerSources: 0,
      remoteAvailable: false,
      remoteSessionAvailable: false,
      ipcRendererAvailable: false,
      getDisplayMediaAvailable: false,
      electronVersion: null,
      chromiumVersion: null,
      platform: (window as any).process?.platform || navigator.platform || 'unknown',
      handlerSetupResult: 'not attempted',
      bestPath: 'mic_only'
    };

    const electronRequire = (window as any).require;
    if (!electronRequire) {
      result.bestPath = 'mic_only (require not available)';
      return result;
    }

    // Electron module
    try {
      const electron = electronRequire('electron');
      result.electronAvailable = !!electron;
      result.ipcRendererAvailable = !!electron?.ipcRenderer?.invoke;

      if (electron?.desktopCapturer?.getSources) {
        result.desktopCapturerAvailable = true;
        try {
          const sources = await electron.desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
          result.desktopCapturerSources = sources?.length || 0;
        } catch {}
      }
    } catch {}

    // @electron/remote
    try {
      const remote = electronRequire('@electron/remote');
      result.remoteAvailable = !!remote;
      result.remoteSessionAvailable = !!remote?.session?.defaultSession?.setDisplayMediaRequestHandler;
    } catch {}

    // electron.remote (legacy)
    if (!result.remoteAvailable) {
      try {
        const remote = electronRequire('electron')?.remote;
        result.remoteAvailable = !!remote;
        result.remoteSessionAvailable = !!remote?.session?.defaultSession?.setDisplayMediaRequestHandler;
      } catch {}
    }

    // Versions
    try {
      const versions = (window as any).process?.versions;
      result.electronVersion = versions?.electron || null;
      result.chromiumVersion = versions?.chrome || null;
    } catch {}

    result.getDisplayMediaAvailable = !!navigator.mediaDevices?.getDisplayMedia;

    // Try to set up the handler
    if (result.remoteSessionAvailable) {
      const ok = await AudioRecorder.setupDisplayMediaHandler();
      result.handlerSetupResult = ok ? 'SUCCESS' : 'failed';
    } else {
      result.handlerSetupResult = 'remote not available';
    }

    // Determine best path
    if (result.desktopCapturerAvailable && result.desktopCapturerSources > 0) {
      result.bestPath = 'electron_desktopCapturer (zero-click)';
    } else if (AudioRecorder._displayMediaHandlerReady) {
      result.bestPath = 'getDisplayMedia + loopback handler (zero-click)';
    } else if (result.getDisplayMediaAvailable) {
      result.bestPath = 'getDisplayMedia (may show system picker)';
    } else {
      result.bestPath = 'mic_only';
    }

    return result;
  }

  /**
   * Get the method used for system audio in the current recording session.
   */
  getSystemAudioMethod(): SystemAudioMethod {
    return this.activeSystemAudioMethod;
  }

  /**
   * Check if the display media handler was successfully installed.
   */
  static isHandlerReady(): boolean {
    return AudioRecorder._displayMediaHandlerReady;
  }

  /**
   * Set up Web Audio API for level analysis
   */
  private setupAudioAnalysis(): void {
    if (!this.stream) return;

    try {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
    } catch (error) {
      console.warn('Failed to set up audio analysis:', error);
    }
  }

  /**
   * Start tracking recording duration
   */
  private startDurationTracking(): void {
    this.durationInterval = setInterval(() => {
      if (this.state.isRecording && !this.state.isPaused) {
        const elapsed = Date.now() - this.startTime - this.pausedDuration;
        this.state.duration = Math.floor(elapsed / 1000);
        this.notifyStateChange();

        // Hard stop at 90 minutes — prevent excessively long recordings
        if (this.state.duration >= 5400) {
          console.log('[Eudia] Maximum recording duration reached (90 minutes) — auto-stopping');
          this.stop();
        }
      }
    }, 100);
  }

  /**
   * Start tracking audio levels
   */
  private startLevelTracking(): void {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    
    this.levelInterval = setInterval(() => {
      if (this.state.isRecording && !this.state.isPaused && this.analyser) {
        this.analyser.getByteFrequencyData(dataArray);
        
        // Calculate average level
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        this.state.audioLevel = Math.min(100, Math.round((average / 255) * 100 * 2));
        this.notifyStateChange();
      }
    }, 50);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEVICE MONITORING — detect connects/disconnects during recording
  // ═══════════════════════════════════════════════════════════════════════════

  private startDeviceMonitoring(): void {
    this.deviceChangeHandler = async () => {
      if (!this.state.isRecording) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(d => d.kind === 'audioinput');
        const micLabels = mics.map(d => d.label);
        const activeDeviceLost = this.activeDeviceLabel && !micLabels.some(l => l === this.activeDeviceLabel);
        this.emitEvent({
          type: 'deviceChanged',
          newDevices: mics.map(d => ({ deviceId: d.deviceId, label: d.label, isVirtual: VIRTUAL_DEVICE_PATTERNS.some(p => p.test(d.label)) })),
          activeDeviceLost: !!activeDeviceLost
        });
        const newHeadphone = mics.find(d => AudioRecorder.isHeadphoneDevice(d.label) && d.label !== this.activeDeviceLabel);
        if (newHeadphone) {
          this.emitEvent({ type: 'headphoneDetected', deviceLabel: newHeadphone.label });
        }
      } catch (e) {
        console.warn('[AudioRecorder] Device change detection failed:', e);
      }
    };
    navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeHandler);
  }

  private stopDeviceMonitoring(): void {
    if (this.deviceChangeHandler) {
      navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeHandler);
      this.deviceChangeHandler = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SILENCE WATCHDOG — alert user if no audio detected for 30+ seconds
  // ═══════════════════════════════════════════════════════════════════════════

  private startSilenceWatchdog(): void {
    this.consecutiveSilentChecks = 0;
    this.silenceAlerted = false;
    this.silenceCheckInterval = setInterval(() => {
      if (!this.state.isRecording || this.state.isPaused) return;
      if (this.state.audioLevel < AudioRecorder.SILENCE_THRESHOLD) {
        this.consecutiveSilentChecks++;
        if (this.consecutiveSilentChecks >= AudioRecorder.SILENCE_ALERT_AFTER && !this.silenceAlerted) {
          this.silenceAlerted = true;
          this.emitEvent({ type: 'silenceDetected', durationSeconds: this.consecutiveSilentChecks * 5 });
        }
      } else {
        if (this.silenceAlerted) {
          this.emitEvent({ type: 'audioRestored' });
        }
        this.consecutiveSilentChecks = 0;
        this.silenceAlerted = false;
      }
    }, 5000);
  }

  private stopSilenceWatchdog(): void {
    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
      this.silenceCheckInterval = null;
    }
  }

  /**
   * Capture the active mic device label after getUserMedia succeeds
   */
  private captureActiveDeviceLabel(stream: MediaStream): void {
    const track = stream.getAudioTracks()[0];
    this.activeDeviceLabel = track?.label || '';
    if (AudioRecorder.isHeadphoneDevice(this.activeDeviceLabel)) {
      this.emitEvent({ type: 'headphoneDetected', deviceLabel: this.activeDeviceLabel });
    }
  }

  /**
   * Pause recording
   */
  pauseRecording(): void {
    if (!this.state.isRecording || this.state.isPaused) return;
    
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.pauseStartTime = Date.now();
      this.state.isPaused = true;
      this.notifyStateChange();
    }
  }

  /**
   * Resume recording
   */
  resumeRecording(): void {
    if (!this.state.isRecording || !this.state.isPaused) return;
    
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      this.pausedDuration += Date.now() - this.pauseStartTime;
      this.state.isPaused = false;
      this.notifyStateChange();
    }
  }

  /**
   * Stop recording and return the audio data
   * Includes a 10-second timeout to prevent hanging if onstop doesn't fire
   */
  async stopRecording(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.state.isRecording) {
        reject(new Error('Not currently recording'));
        return;
      }

      const mimeType = this.mediaRecorder.mimeType;
      const duration = this.state.duration;
      const captureMode = this.activeCaptureMode;
      const hasVirtualDevice = this.activeHasVirtualDevice;
      const systemAudioMethod = this.activeSystemAudioMethod;
      let resolved = false;

      const buildResult = (audioBlob: Blob): RecordingResult => {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        const extension = mimeType.includes('webm') ? 'webm' :
                         mimeType.includes('mp4') ? 'm4a' :
                         mimeType.includes('ogg') ? 'ogg' : 'webm';
        return {
          audioBlob,
          duration,
          mimeType,
          filename: `recording-${dateStr}-${timeStr}.${extension}`,
          captureMode,
          hasVirtualDevice,
          systemAudioMethod
        };
      };

      const safetyTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn('AudioRecorder: onstop timeout, forcing completion');
          try {
            const audioBlob = new Blob(this.audioChunks, { type: mimeType });
            this.cleanup();
            resolve(buildResult(audioBlob));
          } catch (error) {
            this.cleanup();
            reject(new Error('Failed to process recording after timeout'));
          }
        }
      }, 10000);

      this.mediaRecorder.onstop = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(safetyTimeout);
        try {
          console.log(`[AudioRecorder] Chunks collected: ${this.audioChunks.length}`);
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          console.log(`[AudioRecorder] Blob size: ${audioBlob.size} bytes`);
          this.cleanup();
          resolve(buildResult(audioBlob));
        } catch (error) {
          this.cleanup();
          reject(error);
        }
      };

      this.mediaRecorder.onerror = (event) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(safetyTimeout);
        this.cleanup();
        reject(new Error('Recording error occurred'));
      };

      // Request any pending data before stopping
      // This ensures we capture the final chunk
      if (this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.requestData();
      }
      
      // Small delay to allow final data to be collected, then stop
      setTimeout(() => {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
      }, 100);
    });
  }

  /**
   * Cancel recording without saving
   */
  cancelRecording(): void {
    this.cleanup();
  }

  /**
   * Clean up all resources
   */
  private cleanup(): void {
    // Stop intervals
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
    
    if (this.levelInterval) {
      clearInterval(this.levelInterval);
      this.levelInterval = null;
    }

    this.stopDeviceMonitoring();
    this.stopSilenceWatchdog();

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
      this.analyser = null;
    }

    // Stop all tracks
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // Stop secondary stream (virtual audio device) if active
    if (this.secondaryStream) {
      this.secondaryStream.getTracks().forEach(track => track.stop());
      this.secondaryStream = null;
    }

    // Reset recorder
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.activeDeviceLabel = '';

    // Reset state
    this.state = {
      isRecording: false,
      isPaused: false,
      duration: 0,
      audioLevel: 0
    };
    
    this.notifyStateChange();
  }

  /**
   * Get current recording state
   */
  getState(): RecordingState {
    return { ...this.state };
  }

  /**
   * Check if browser supports audio recording
   * Includes mobile/iOS compatibility checks
   */
  static isSupported(): boolean {
    // Basic API availability
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      return false;
    }
    
    // Check if at least one audio format is supported
    const formats = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/webm;codecs=opus'];
    const hasSupport = formats.some(format => MediaRecorder.isTypeSupported(format));
    
    if (!hasSupport) {
      console.warn('[AudioRecorder] No supported audio formats found');
    }
    
    return hasSupport;
  }

  /**
   * Get mobile-specific recording instructions
   */
  static getMobileInstructions(): string | null {
    if (!this.isIOSOrSafari()) {
      return null;
    }
    return 'For best results on iOS, ensure you have granted microphone permissions in Settings > Privacy > Microphone.';
  }

  /**
   * Notify callback of state change
   */
  private notifyStateChange(): void {
    if (this.stateCallback) {
      this.stateCallback({ ...this.state });
    }
  }

  /**
   * Format duration as MM:SS
   */
  static formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Convert blob to base64 for transmission
   */
  static async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix to get just the base64
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Convert blob to ArrayBuffer for file saving
   */
  static async blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    return blob.arrayBuffer();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WRAPPER METHODS - Short aliases for main.ts compatibility
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Alias for startRecording()
   */
  async start(options?: AudioRecordingOptions): Promise<void> {
    return this.startRecording(options);
  }

  /**
   * Alias for stopRecording()
   */
  async stop(): Promise<RecordingResult> {
    return this.stopRecording();
  }

  /**
   * Alias for pauseRecording()
   */
  pause(): void {
    return this.pauseRecording();
  }

  /**
   * Alias for resumeRecording()
   */
  resume(): void {
    return this.resumeRecording();
  }

  /**
   * Alias for cancelRecording()
   */
  cancel(): void {
    return this.cancelRecording();
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.state.isRecording;
  }

  /**
   * Extract new audio chunks since last extraction (for live transcription).
   * Returns null if no new chunks available.
   * Does NOT stop recording - continues capturing.
   */
  extractNewChunks(): Blob | null {
    if (!this.state.isRecording || this.audioChunks.length === 0) {
      return null;
    }

    // Get chunks we haven't extracted yet
    const newChunks = this.audioChunks.slice(this.lastExtractedChunkIndex);
    
    if (newChunks.length === 0) {
      return null;
    }

    // Update the extraction index
    this.lastExtractedChunkIndex = this.audioChunks.length;

    // Create a blob from just the new chunks
    return new Blob(newChunks, { type: this.mimeTypeCache });
  }

  /**
   * Get all audio captured so far (without stopping recording).
   * Useful for full transcript query during recording.
   */
  getAllChunksAsBlob(): Blob | null {
    if (this.audioChunks.length === 0) {
      return null;
    }
    return new Blob(this.audioChunks, { type: this.mimeTypeCache });
  }

  /**
   * Get current recording duration in seconds
   */
  getDuration(): number {
    return this.state.duration;
  }

  /**
   * Get the MIME type being used for recording
   */
  getMimeType(): string {
    return this.mimeTypeCache;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIO DIAGNOSTICS - Detect silent/low audio before transcription
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Track audio levels during recording for post-recording diagnostics.
   * This is tracked automatically during recording via startLevelTracking().
   */
  private levelHistory: number[] = [];
  private trackingLevels: boolean = false;

  /**
   * Start tracking audio levels for diagnostics
   * (Called automatically during recording)
   */
  private startLevelHistoryTracking(): void {
    this.levelHistory = [];
    this.trackingLevels = true;
  }

  /**
   * Add current level to history
   * (Called during level tracking interval)
   */
  private recordLevelSample(): void {
    if (this.trackingLevels) {
      this.levelHistory.push(this.state.audioLevel);
    }
  }

  /**
   * Get audio diagnostic after recording completes.
   * Call this after stopRecording() to check for potential issues.
   */
  getAudioDiagnostic(): AudioDiagnostic {
    if (this.levelHistory.length === 0) {
      // No level history - likely didn't track or very short recording
      return {
        hasAudio: true, // Assume true if we can't check
        averageLevel: 0,
        peakLevel: 0,
        silentPercent: 100,
        warning: 'Unable to analyze audio levels - recording may be too short'
      };
    }

    const average = this.levelHistory.reduce((a, b) => a + b, 0) / this.levelHistory.length;
    const peak = Math.max(...this.levelHistory);
    const silentSamples = this.levelHistory.filter(l => l < 5).length;
    const silentPercent = Math.round((silentSamples / this.levelHistory.length) * 100);

    let warning: string | null = null;

    // Check for common issues
    if (peak < 5) {
      warning = 'SILENT AUDIO: No audio was detected during recording. Check your microphone settings and ensure Obsidian has microphone permission.';
    } else if (average < 10 && silentPercent > 80) {
      warning = 'VERY LOW AUDIO: Audio levels were extremely low. The transcription may not be accurate. Check your microphone or move closer to it.';
    } else if (silentPercent > 90) {
      warning = 'MOSTLY SILENT: Over 90% of the recording had no audio. Make sure you\'re capturing the meeting audio, not just silence.';
    }

    return {
      hasAudio: peak >= 5,
      averageLevel: Math.round(average),
      peakLevel: peak,
      silentPercent,
      warning
    };
  }

  /**
   * Analyze an audio blob for audio presence.
   * This is a more thorough check that analyzes the actual audio data.
   * Returns a diagnostic result.
   */
  static async analyzeAudioBlob(blob: Blob): Promise<AudioDiagnostic> {
    try {
      const audioContext = new AudioContext();
      const arrayBuffer = await blob.arrayBuffer();
      
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      } catch (decodeError) {
        // Can't decode - might be a codec issue, not necessarily silent
        await audioContext.close();
        return {
          hasAudio: true, // Assume true - let the server handle it
          averageLevel: 0,
          peakLevel: 0,
          silentPercent: 0,
          warning: 'Could not analyze audio format. Proceeding with transcription.'
        };
      }

      const channelData = audioBuffer.getChannelData(0);
      
      // Analyze the audio samples
      let sum = 0;
      let peak = 0;
      let silentSamples = 0;
      const sampleThreshold = 0.01; // Below this is considered silent
      
      // Sample every 100th sample for efficiency
      const sampleStep = 100;
      let samplesChecked = 0;
      
      for (let i = 0; i < channelData.length; i += sampleStep) {
        const sample = Math.abs(channelData[i]);
        sum += sample;
        if (sample > peak) peak = sample;
        if (sample < sampleThreshold) silentSamples++;
        samplesChecked++;
      }

      await audioContext.close();

      const average = sum / samplesChecked;
      const silentPercent = Math.round((silentSamples / samplesChecked) * 100);
      
      // Convert to 0-100 scale
      const averageLevel = Math.round(average * 100 * 10); // Amplify for readability
      const peakLevel = Math.round(peak * 100);

      let warning: string | null = null;

      if (peak < 0.01) {
        warning = 'SILENT AUDIO DETECTED: The recording appears to contain only silence. This typically causes Whisper to hallucinate random text like "Yes. Yes. Yes." Check your audio input source.';
      } else if (average < 0.005 && silentPercent > 95) {
        warning = 'NEAR-SILENT AUDIO: The recording is almost entirely silent. The transcription will likely be inaccurate.';
      } else if (silentPercent > 90) {
        warning = 'MOSTLY SILENT: Over 90% of the recording is silent. Consider checking your audio setup.';
      }

      return {
        hasAudio: peak >= 0.01,
        averageLevel,
        peakLevel,
        silentPercent,
        warning
      };
    } catch (error) {
      console.error('Audio analysis failed:', error);
      return {
        hasAudio: true, // Assume true if we can't check
        averageLevel: 0,
        peakLevel: 0,
        silentPercent: 0,
        warning: null
      };
    }
  }
}

