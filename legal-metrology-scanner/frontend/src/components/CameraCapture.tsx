import React, { useRef, useState, useEffect } from 'react';
import { Camera, Upload, SwitchCamera, AlertCircle, Image as ImageIcon, Zap } from 'lucide-react';

interface CameraCaptureProps {
  onImageSelected: (imageSrc: string) => void;
  onImagesSelected?: (imageSrcs: string[]) => void;
  remainingSlots?: number;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  onImageSelected,
  onImagesSelected,
  remainingSlots = 3,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const startCamera = async (deviceId?: string) => {
    setCameraError(null);
    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: deviceId 
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      setCameraActive(true);

      // Fetch available camera devices
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter((d) => d.kind === 'videoinput');
      setDevices(videoDevices);
      if (!deviceId && videoDevices.length > 0) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch (err: any) {
      console.warn('Webcam start error:', err);
      setCameraActive(false);
      setCameraError(
        err.name === 'NotAllowedError' 
          ? 'Camera access was denied. Please allow camera permissions or upload an image file.' 
          : 'Camera is unavailable. You can upload a product packaging image instead.'
      );
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  };

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const handleSwitchCamera = () => {
    if (devices.length <= 1) return;
    const currentIndex = devices.findIndex((d) => d.deviceId === selectedDeviceId);
    const nextIndex = (currentIndex + 1) % devices.length;
    const nextDevice = devices[nextIndex];
    setSelectedDeviceId(nextDevice.deviceId);
    startCamera(nextDevice.deviceId);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      stopCamera();
      onImageSelected(dataUrl);
    }
  };

  const readFilesAsDataUrls = (fileList: File[]): Promise<string[]> =>
    Promise.all(
      fileList.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result) {
                resolve(event.target.result as string);
              } else {
                reject(new Error('Could not read image file'));
              }
            };
            reader.onerror = () => reject(reader.error || new Error('File read failed'));
            reader.readAsDataURL(file);
          }),
      ),
    );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).filter((file) => file.type.startsWith('image/'));
    if (!selected.length) {
      return;
    }
    const limited = selected.slice(0, remainingSlots);
    stopCamera();
    if (limited.length > 1 && onImagesSelected) {
      onImagesSelected(await readFilesAsDataUrls(limited));
      return;
    }
    const [first] = await readFilesAsDataUrls(limited);
    onImageSelected(first);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          stopCamera();
          onImageSelected(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '30px auto 0', padding: '0 20px' }}>
      <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        
        {/* Title */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px', borderRadius: '20px', background: 'rgba(99, 102, 241, 0.1)', color: '#6366F1', fontSize: '0.8rem', fontWeight: 700, marginBottom: '12px' }}>
            <Zap size={14} /> STEP 1: CAPTURE OR UPLOAD LABEL
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Scan Product Packaging Label</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '6px' }}>
            Capture or upload 1 to {remainingSlots} panels (front, back, sides). Declarations are merged before scoring.
          </p>
        </div>

        {/* Video Viewport / Camera Box */}
        <div 
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16/10',
            maxHeight: '450px',
            borderRadius: 'var(--radius-md)',
            background: '#04070F',
            border: '2px dashed var(--border-subtle)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '24px'
          }}
        >
          {cameraActive ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />

              {/* Viewfinder Target Framing */}
              <div style={{
                position: 'absolute',
                inset: '20px',
                border: '2px dashed rgba(6, 182, 212, 0.6)',
                borderRadius: '12px',
                pointerEvents: 'none',
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)'
              }}>
                <div style={{ position: 'absolute', top: 12, left: 12, color: 'var(--accent-cyan)', fontSize: '0.75rem', fontWeight: 700, background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: '4px' }}>
                  ALIGN LABEL HERE
                </div>
              </div>

              {/* Camera Switcher Button */}
              {devices.length > 1 && (
                <button
                  onClick={handleSwitchCamera}
                  style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    color: '#fff',
                    padding: '8px 12px',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.8rem'
                  }}
                >
                  <SwitchCamera size={16} /> Switch Camera
                </button>
              )}
            </>
          ) : (
            <div style={{ padding: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                color: 'var(--accent-indigo)'
              }}>
                <ImageIcon size={32} />
              </div>

              {cameraError ? (
                <div style={{ color: '#F43F5E', fontSize: '0.9rem', marginBottom: '16px', maxWidth: '400px' }}>
                  <AlertCircle size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                  {cameraError}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
                  Starting webcam feed or drag & drop image file here...
                </p>
              )}

              <button onClick={() => startCamera()} className="btn-secondary" style={{ fontSize: '0.85rem' }}>
                <Camera size={16} /> Enable Camera
              </button>
            </div>
          )}
        </div>

        {/* Hidden Canvas for Video Snapshot */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Action Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center' }}>
          {cameraActive && (
            <button onClick={capturePhoto} className="btn-primary" style={{ padding: '14px 32px', fontSize: '1rem' }}>
              <Camera size={20} /> Snap Label Photo
            </button>
          )}

          <label className="btn-secondary" style={{ padding: '14px 24px', cursor: 'pointer', fontSize: '0.95rem' }}>
            <Upload size={18} /> Upload Image File{remainingSlots > 1 ? 's' : ''}
            <input
              type="file"
              accept="image/*"
              multiple={remainingSlots > 1}
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </label>
        </div>

      </div>
    </div>
  );
};
