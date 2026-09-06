import React, { useEffect, useState } from 'react';
import { ShieldCheck, Cpu, RefreshCw, AlertCircle } from 'lucide-react';
import { checkBackendStatus } from '../services/api';

interface NavbarProps {
  onReset: () => void;
  currentStep: string;
}

export const Navbar: React.FC<NavbarProps> = ({ onReset, currentStep }) => {
  const [isBackendOnline, setIsBackendOnline] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const verifyConnection = async () => {
    setIsChecking(true);
    const online = await checkBackendStatus();
    setIsBackendOnline(online);
    setIsChecking(false);
  };

  useEffect(() => {
    verifyConnection();
    const interval = setInterval(verifyConnection, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header style={{
      borderBottom: '1px solid var(--border-subtle)',
      background: 'rgba(7, 11, 20, 0.85)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      padding: '14px 24px'
    }}>
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Brand Logo */}
        <div 
          onClick={onReset}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer'
          }}
        >
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 16px rgba(99, 102, 241, 0.4)'
          }}>
            <ShieldCheck size={24} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #FFFFFF 0%, #94A3B8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Legal Metrology Scanner
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Statutory Packaged Commodities Compliance AI
            </p>
          </div>
        </div>

        {/* Backend & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Backend Health Badge */}
          <div 
            title="Click to re-check API status"
            onClick={verifyConnection}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: isBackendOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
              border: `1px solid ${isBackendOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
              color: isBackendOnline ? '#10B981' : '#F43F5E'
            }}
          >
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isBackendOnline ? '#10B981' : '#F43F5E',
              boxShadow: isBackendOnline ? '0 0 8px #10B981' : '0 0 8px #F43F5E'
            }} />
            {isChecking ? (
              'Checking...'
            ) : isBackendOnline ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Cpu size={14} /> FastAPI API Online
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={14} /> Backend Offline (port 8000)
              </span>
            )}
          </div>

          {currentStep !== 'CAPTURE' && (
            <button
              onClick={onReset}
              className="btn-secondary"
              style={{ padding: '8px 14px', fontSize: '0.85rem' }}
            >
              <RefreshCw size={15} /> New Scan
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
