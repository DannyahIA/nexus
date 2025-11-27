/**
 * Voice Activity Detector
 * 
 * Detects when audio is active (speaking) based on audio level analysis.
 * Uses Web Audio API to analyze audio streams and detect voice activity.
 */

export type VoiceActivityCallback = (isActive: boolean, level: number) => void;

export class VoiceActivityDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private dataArray: Uint8Array | null = null;
  private animationFrameId: number | null = null;

  private threshold: number = -50; // dB
  private smoothingFactor: number = 0.8;
  private callback: VoiceActivityCallback | null = null;

  private isActive: boolean = false;
  private currentLevel: number = -Infinity;

  /**
   * Attach the detector to a media stream
   */
  attachToStream(stream: MediaStream): void {
    this.detach(); // Clean up any existing connection

    try {
      // Create audio context
      this.audioContext = new AudioContext();

      // Create analyser node
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = this.smoothingFactor;

      // Create source from stream
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.sourceNode.connect(this.analyser);

      // Create data array for frequency data
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      // Start monitoring
      this.startMonitoring();
    } catch (error) {
      console.error('Failed to attach voice activity detector:', error);
      this.detach();
    }
  }

  /**
   * Detach from the current stream and clean up resources
   */
  detach(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.dataArray = null;
    this.isActive = false;
    this.currentLevel = -Infinity;
  }

  /**
   * Set the callback for voice activity changes
   */
  onVoiceActivity(callback: VoiceActivityCallback): void {
    this.callback = callback;
  }

  /**
   * Set the threshold for voice activity detection (in dB)
   */
  setThreshold(threshold: number): void {
    this.threshold = threshold;
  }

  /**
   * Get the current threshold
   */
  getThreshold(): number {
    return this.threshold;
  }

  /**
   * Start monitoring audio levels
   */
  private startMonitoring(): void {
    const monitor = () => {
      if (!this.analyser || !this.dataArray) {
        return;
      }

      // Get frequency data
      // @ts-ignore - ArrayBufferLike is compatible with ArrayBuffer for this use case
      this.analyser.getByteFrequencyData(this.dataArray);

      // Calculate average level
      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        sum += this.dataArray[i];
      }
      const average = sum / this.dataArray.length;

      // Convert to dB (0-255 range to dB)
      // 0 = silence, 255 = max volume
      const db = average > 0 ? 20 * Math.log10(average / 255) : -Infinity;

      this.currentLevel = db;

      // Check if voice activity detected
      const wasActive = this.isActive;
      this.isActive = db > this.threshold;

      // Notify callback if state changed or level updated
      if (this.callback && (wasActive !== this.isActive || this.isActive)) {
        this.callback(this.isActive, db);
      }

      // Continue monitoring
      this.animationFrameId = requestAnimationFrame(monitor);
    };

    monitor();
  }

  /**
   * Get the current voice activity state
   */
  getIsActive(): boolean {
    return this.isActive;
  }

  /**
   * Get the current audio level (in dB)
   */
  getCurrentLevel(): number {
    return this.currentLevel;
  }

  /**
   * Check if a given audio level would trigger voice activity
   * (Useful for testing)
   */
  checkLevel(audioLevel: number): boolean {
    return audioLevel > this.threshold;
  }
}
