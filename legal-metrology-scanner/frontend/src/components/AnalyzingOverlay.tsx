import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface AnalyzingOverlayProps {
  imageSrc?: string;
  imageSrcs?: string[];
}

export const AnalyzingOverlay: React.FC<AnalyzingOverlayProps> = ({ imageSrc, imageSrcs }) => {
  const previews = imageSrcs?.length ? imageSrcs : imageSrc ? [imageSrc] : [];
  const [loadingText, setLoadingText] = useState('🔍 Extracting text using PaddleOCR...');

  useEffect(() => {
    setLoadingText('🔍 Extracting text using PaddleOCR...');
    const timer1 = setTimeout(() => {
      setLoadingText('🧠 AI is parsing Legal Metrology rules...');
    }, 2000);
    const timer2 = setTimeout(() => {
      setLoadingText('📊 Generating compliance report...');
    }, 4000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
      <div className="glass-panel" style={{ padding: '36px', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'relative',
          width: '100%',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          marginBottom: '24px',
          border: '1px solid var(--border-subtle)',
          display: 'grid',
          gridTemplateColumns: previews.length > 1 ? 'repeat(auto-fit, minmax(140px, 1fr))' : '1fr',
          gap: '8px',
        }}>
          {previews.map((src) => (
            <img
              key={src}
              src={src}
              alt="Analyzing label"
              style={{ width: '100%', maxHeight: '280px', objectFit: 'contain', display: 'block' }}
            />
          ))}
          <div className="scanner-beam" />
          <div className="scanner-grid-overlay" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--accent-cyan)', marginBottom: '8px' }}>
          <Loader2 size={24} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{loadingText}</span>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Running PaddleOCR on {previews.length} image{previews.length === 1 ? '' : 's'} and checking the six Legal Metrology declarations...
        </p>

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
};
