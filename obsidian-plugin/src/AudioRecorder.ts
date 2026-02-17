/**
 * AudioRecorder - Handles audio recording using the MediaRecorder API
 * Designed for Obsidian plugin environment
 */

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
}

/**
 * Audio quality diagnostic result
 */
export interface AudioDiagnostic {
  hasAudio: boolean;
  averageLevel: number;
  peakLevel: number;
  silentPercent: number;
  warning: string | null;
}

export type RecordingStateCallback = (state: RecordingState) => void;

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private startTime: number = 0;
  private pausedDuration: number = 0;
  private pauseStartTime: number = 0;
  private durationInterval: NodeJS.Timeout | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelInterval: NodeJS.Timeout | null = null;
  
  // Live query support - track chunks already extracted
  private lastExtractedChunkIndex: number = 0;
  private mimeTypeCache: string = 'audio/webm';
  
  private state: RecordingState = {
    isRecording: false,
    isPaused: false,
    duration: 0,
    audioLevel: 0
  };
  
  private stateCallback: RecordingStateCallback | null = null;

  /**
   * Set callback for state updates (duration, audio levels, etc.)
   */
  onStateChange(callback: RecordingStateCallback): void {
    this.stateCallback = callback;
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
   * Request microphone access and start recording
   */
  async startRecording(): Promise<void> {
    if (this.state.isRecording) {
      throw new Error('Already recording');
    }

    try {
      // Check for mobile/iOS - use simpler constraints for better compatibility
      const isIOSSafari = AudioRecorder.isIOSOrSafari();
      
      // iOS has stricter constraints - use simpler config for compatibility
      const audioConstraints = isIOSSafari ? {
        echoCancellation: true,
        noiseSuppression: true
        // iOS doesn't support sampleRate/channelCount constraints well
      } : {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,      // Higher sample rate for clarity
        channelCount: 1         // Mono is optimal for speech
      };
      
      // Request microphone access
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });
      
      console.log(`[AudioRecorder] Microphone access granted (iOS/Safari: ${isIOSSafari})`);

      // Try to capture system audio (for headphone users — captures the other person)
      let finalStream = micStream;
      try {
        if (!isIOSSafari && navigator.mediaDevices.getDisplayMedia) {
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: false
          } as any);
          
          // Mix mic + system audio
          this.audioContext = new AudioContext();
          const micSource = this.audioContext.createMediaStreamSource(micStream);
          const displaySource = this.audioContext.createMediaStreamSource(displayStream);
          const destination = this.audioContext.createMediaStreamDestination();
          micSource.connect(destination);
          displaySource.connect(destination);
          finalStream = destination.stream;
          
          // Store display stream for cleanup
          (this as any)._displayStream = displayStream;
          console.log('[AudioRecorder] System audio capture enabled (mic + speakers mixed)');
        }
      } catch (displayErr: any) {
        // User denied screen share or API not available — fall back to mic only
        console.log(`[AudioRecorder] System audio not available (${displayErr.message || 'denied'}), using mic only. For best results, use laptop speakers instead of headphones.`);
      }
      
      this.stream = finalStream;

      // Set up audio analysis for level metering
      this.setupAudioAnalysis();

      // 128kbps for better Whisper accuracy — reduces hallucination on long recordings
      // At 128kbps with 10MB chunks, each chunk ≈ 10 min of audio
      const mimeType = this.getSupportedMimeType();
      this.mimeTypeCache = mimeType;
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 128000
      });

      this.audioChunks = [];
      this.lastExtractedChunkIndex = 0;

      // Handle data available
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // Start recording with timeslice for periodic data
      this.mediaRecorder.start(1000); // Get data every second

      // Track timing
      this.startTime = Date.now();
      this.pausedDuration = 0;
      
      // Update state
      this.state = {
        isRecording: true,
        isPaused: false,
        duration: 0,
        audioLevel: 0
      };
      
      // Start duration tracking
      this.startDurationTracking();
      this.startLevelTracking();
      
      this.notifyStateChange();

    } catch (error) {
      this.cleanup();
      throw new Error(`Failed to start recording: ${error.message}`);
    }
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
      let resolved = false;

      // Safety timeout - if onstop doesn't fire within 10 seconds, force completion
      const safetyTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn('AudioRecorder: onstop timeout, forcing completion');
          
          try {
            // Create blob from whatever chunks we have
            const audioBlob = new Blob(this.audioChunks, { type: mimeType });
            
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
            const extension = mimeType.includes('webm') ? 'webm' : 
                             mimeType.includes('mp4') ? 'm4a' : 
                             mimeType.includes('ogg') ? 'ogg' : 'webm';
            const filename = `recording-${dateStr}-${timeStr}.${extension}`;

            this.cleanup();

            resolve({
              audioBlob,
              duration,
              mimeType,
              filename
            });
          } catch (error) {
            this.cleanup();
            reject(new Error('Failed to process recording after timeout'));
          }
        }
      }, 10000);

      this.mediaRecorder.onstop = () => {
        if (resolved) return; // Already resolved by timeout
        resolved = true;
        clearTimeout(safetyTimeout);
        
        try {
          // Log chunk count for debugging
          console.log(`[AudioRecorder] Chunks collected: ${this.audioChunks.length}`);
          
          // Create blob from chunks
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          console.log(`[AudioRecorder] Blob size: ${audioBlob.size} bytes`);
          
          // Generate filename
          const now = new Date();
          const dateStr = now.toISOString().split('T')[0];
          const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
          const extension = mimeType.includes('webm') ? 'webm' : 
                           mimeType.includes('mp4') ? 'm4a' : 
                           mimeType.includes('ogg') ? 'ogg' : 'webm';
          const filename = `recording-${dateStr}-${timeStr}.${extension}`;

          this.cleanup();

          resolve({
            audioBlob,
            duration,
            mimeType,
            filename
          });
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

    // Stop display stream (system audio capture) if active
    if ((this as any)._displayStream) {
      (this as any)._displayStream.getTracks().forEach((track: any) => track.stop());
      (this as any)._displayStream = null;
    }

    // Reset recorder
    this.mediaRecorder = null;
    this.audioChunks = [];

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
  async start(): Promise<void> {
    return this.startRecording();
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

