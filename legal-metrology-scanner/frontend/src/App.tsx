import { useState } from 'react';
import { Navbar } from './components/Navbar';
import { CameraCapture } from './components/CameraCapture';
import { ImageCropper } from './components/ImageCropper';
import { AnalyzingOverlay } from './components/AnalyzingOverlay';
import { ResultsView } from './components/ResultsView';
import { analyzeLabelImages } from './services/api';
import type { AnalyzeLabelResponse, QueuedLabel, ScannerStep } from './types/scanner';
import { AlertCircle, RefreshCw, Plus, ScanSearch, Trash2 } from 'lucide-react';

const MAX_IMAGES = 3;
const FACE_LABELS = ['Front', 'Back', 'Side'];

export function App() {
  const [step, setStep] = useState<ScannerStep>('CAPTURE');
  const [capturedImageSrc, setCapturedImageSrc] = useState<string | null>(null);
  const [queued, setQueued] = useState<QueuedLabel[]>([]);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeLabelResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleImageSelected = (dataUrl: string) => {
    setCapturedImageSrc(dataUrl);
    setErrorMessage(null);
    setStep('CROP');
  };

  const handleMultiSelected = (dataUrls: string[]) => {
    const remaining = MAX_IMAGES - queued.length;
    const accepted = dataUrls.slice(0, remaining);
    if (!accepted.length) {
      setErrorMessage(`You already have ${MAX_IMAGES} images. Remove one to add another.`);
      return;
    }
    setQueued((prev) => [
      ...prev,
      ...accepted.map((src, index) => ({
        id: `${Date.now()}-${index}`,
        src,
        blob: dataUrlToBlob(src),
        label: FACE_LABELS[prev.length + index] || `Image ${prev.length + index + 1}`,
      })),
    ]);
    setErrorMessage(null);
    setStep('REVIEW');
  };

  const handleCropComplete = (croppedBlob: Blob) => {
    const croppedUrl = URL.createObjectURL(croppedBlob);
    setQueued((prev) => {
      const label = FACE_LABELS[prev.length] || `Image ${prev.length + 1}`;
      return [...prev, { id: `${Date.now()}`, src: croppedUrl, blob: croppedBlob, label }];
    });
    setCapturedImageSrc(null);
    setErrorMessage(null);
    setStep('REVIEW');
  };

  const handleAnalyze = async () => {
    if (!queued.length) {
      setErrorMessage('Capture or upload at least one label image.');
      return;
    }
    setErrorMessage(null);
    setStep('ANALYZING');
    try {
      const result = await analyzeLabelImages(queued.map((item) => item.blob));
      setAnalysisResult(result);
      setStep('RESULTS');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to analyze packaging label image.';
      setErrorMessage(message);
      setStep('REVIEW');
    }
  };

  const handleReset = () => {
    queued.forEach((item) => {
      if (item.src.startsWith('blob:')) {
        URL.revokeObjectURL(item.src);
      }
    });
    setStep('CAPTURE');
    setCapturedImageSrc(null);
    setQueued([]);
    setAnalysisResult(null);
    setErrorMessage(null);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar onReset={handleReset} currentStep={step} />

      <main style={{ flex: 1 }}>
        {errorMessage && (
          <div style={{ maxWidth: '800px', margin: '20px auto 0', padding: '0 20px' }}>
            <div style={{
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.4)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 20px',
              color: '#FDA4AF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              fontSize: '0.9rem',
              fontWeight: 600
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircle size={20} color="#F43F5E" />
                <span>{errorMessage}</span>
              </div>
              <button
                onClick={handleReset}
                className="btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem', borderColor: 'rgba(244, 63, 94, 0.4)' }}
              >
                <RefreshCw size={14} /> Start Over
              </button>
            </div>
          </div>
        )}

        {step === 'CAPTURE' && (
          <CameraCapture
            onImageSelected={handleImageSelected}
            onImagesSelected={handleMultiSelected}
            remainingSlots={MAX_IMAGES - queued.length}
          />
        )}

        {step === 'CROP' && capturedImageSrc && (
          <ImageCropper
            imageSrc={capturedImageSrc}
            onCropComplete={handleCropComplete}
            onBack={() => setStep(queued.length ? 'REVIEW' : 'CAPTURE')}
          />
        )}

        {step === 'REVIEW' && (
          <div style={{ maxWidth: '800px', margin: '30px auto 0', padding: '0 20px' }}>
            <div className="glass-panel" style={{ padding: '28px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '8px' }}>
                Label images ({queued.length}/{MAX_IMAGES})
              </h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
                Add front, back, and side panels if the six declarations are split across the pack. Then run compliance.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                {queued.map((item) => (
                  <div key={item.id} style={{ position: 'relative' }}>
                    <img src={item.src} alt={item.label} style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--border-subtle)' }} />
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: '6px' }}>{item.label}</div>
                    <button
                      className="btn-secondary"
                      onClick={() => setQueued((prev) => prev.filter((entry) => entry.id !== item.id))}
                      style={{ marginTop: '6px', padding: '6px 10px', fontSize: '0.75rem' }}
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                {queued.length < MAX_IMAGES && (
                  <button className="btn-secondary" onClick={() => setStep('CAPTURE')}>
                    <Plus size={16} /> Add another image
                  </button>
                )}
                <button className="btn-primary" onClick={handleAnalyze} disabled={!queued.length}>
                  <ScanSearch size={16} /> Analyze {queued.length} image{queued.length === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'ANALYZING' && (
          <AnalyzingOverlay imageSrcs={queued.map((item) => item.src)} />
        )}

        {step === 'RESULTS' && analysisResult && (
          <ResultsView
            data={analysisResult}
            imageSrcs={queued.map((item) => item.src)}
            onReset={handleReset}
          />
        )}
      </main>

      <footer style={{
        textAlign: 'center',
        padding: '20px',
        color: 'var(--text-muted)',
        fontSize: '0.8rem',
        borderTop: '1px solid var(--border-subtle)',
        marginTop: 'auto'
      }}>
        Legal Metrology (Packaged Commodities) Rules, 2011 • Label Compliance Scanner System
      </footer>
    </div>
  );
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, body] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(header)?.[1] || 'image/jpeg';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export default App;
