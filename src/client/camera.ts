// Captura con la cámara del celular (getUserMedia), prefiriendo la cámara trasera.

export type CameraError = 'unsupported' | 'denied' | 'not_found' | 'in_use' | 'unknown';

export class Camera {
  private stream: MediaStream | null = null;
  private facing: 'environment' | 'user' = 'environment';

  constructor(private video: HTMLVideoElement) {}

  static isSupported(): boolean {
    return Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext;
  }

  async start(): Promise<void> {
    this.stop();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: this.facing }, width: { ideal: 2560 }, height: { ideal: 1920 } },
      });
    } catch (err) {
      throw Camera.mapError(err);
    }
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    await this.video.play();
  }

  async canSwitch(): Promise<boolean> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'videoinput').length > 1;
    } catch {
      return false;
    }
  }

  async switch(): Promise<void> {
    this.facing = this.facing === 'environment' ? 'user' : 'environment';
    await this.start();
  }

  capture(): Promise<Blob> {
    const { videoWidth: w, videoHeight: h } = this.video;
    if (!w || !h) return Promise.reject(new Error('La cámara aún no está lista.'));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(this.video, 0, 0, w, h);
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo capturar la foto.'))), 'image/jpeg', 0.92),
    );
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  private static mapError(err: unknown): CameraError {
    const name = (err as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'not_found';
    if (name === 'NotReadableError') return 'in_use';
    return 'unknown';
  }
}

export const CAMERA_ERROR_MESSAGE: Record<CameraError, string> = {
  unsupported: 'Este navegador no permite usar la cámara aquí. Usa “Elegir de la galería”.',
  denied: 'No diste permiso para usar la cámara. Actívalo en los ajustes del navegador o elige una foto de la galería.',
  not_found: 'No se encontró ninguna cámara en este dispositivo.',
  in_use: 'La cámara está siendo usada por otra aplicación.',
  unknown: 'No se pudo abrir la cámara. Elige una foto de la galería.',
};
