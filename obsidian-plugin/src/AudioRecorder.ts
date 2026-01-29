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
   * Get supported MIME type for recording
   */
  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];
    
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    
    return 'audio/webm'; // Default fallback
  }

  /**
   * Request microphone access and start recording
   */
  async startRecording(): Promise<void> {
    if (this.state.isRecording) {
      throw new Error('Already recording');
    }

    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      });

      // Set up audio analysis for level metering
      this.setupAudioAnalysis();

      // Create MediaRecorder
      // Use 48kbps for speech - sufficient quality, smaller files
      // 48kbps allows ~70 min per 25MB (Whisper limit)
      // 90 min call = ~33MB, easily chunked into 2 segments
      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 48000
      });

      this.audioChunks = [];

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
          // Create blob from chunks
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          
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

      // Stop the recorder
      this.mediaRecorder.stop();
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
   */
  static isSupported(): boolean {
    return !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      window.MediaRecorder
    );
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
}

