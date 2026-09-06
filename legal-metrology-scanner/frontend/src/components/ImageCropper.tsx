import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Crop as CropIcon, RotateCw, Check, ArrowLeft } from 'lucide-react';
import { getCroppedImg } from '../utils/cropImage';
import type { PixelCrop } from '../utils/cropImage';

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob) => void;
  onBack: () => void;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({ imageSrc, onCropComplete, onBack }) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<PixelCrop | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropChange = useCallback((cropLocation: { x: number; y: number }) => {
    setCrop(cropLocation);
  }, []);

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const onCropCompleteInternal = useCallback((_: any, croppedPixels: PixelCrop) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleConfirmCrop = async () => {
    if (!croppedAreaPixels) return;
    try {
      setIsProcessing(true);
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels, rotation);
      onCropComplete(croppedBlob);
    } catch (e) {
      console.error('Crop error:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '20px auto', padding: '0 20px' }}>
      <div className="glass-panel" style={{ padding: '24px' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <button onClick={onBack} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
            <ArrowLeft size={16} /> Retake / Back
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.95rem' }}>
            <CropIcon size={18} color="var(--accent-cyan)" /> Adjust & Crop Label Region
          </div>
          <button
            onClick={() => setRotation((prev) => (prev + 90) % 360)}
            className="btn-secondary"
            style={{ padding: '8px 14px', fontSize: '0.85rem' }}
            title="Rotate 90°"
          >
            <RotateCw size={16} /> Rotate
          </button>
        </div>

        {/* Cropper Viewport Container */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: '400px',
          background: '#030712',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          marginBottom: '20px'
        }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={4 / 3}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropCompleteInternal}
          />
        </div>

        {/* Zoom Slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', padding: '0 10px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Zoom:</span>
          <input
            type="range"
            value={zoom}
            min={1}
            max={3}
            step={0.1}
            aria-label="Zoom level"
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--accent-indigo)', cursor: 'pointer' }}
          />
        </div>

        {/* Action Button */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleConfirmCrop}
            disabled={isProcessing}
            className="btn-primary"
            style={{ padding: '12px 32px', fontSize: '1rem' }}
          >
            <Check size={18} /> {isProcessing ? 'Processing Crop...' : 'Confirm Crop & Add Image'}
          </button>
        </div>

      </div>
    </div>
  );
};
