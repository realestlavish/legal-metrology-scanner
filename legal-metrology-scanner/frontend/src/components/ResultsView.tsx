import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, FileText, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import type { AnalyzeLabelResponse, OCRLine, ParsedDeclarations } from '../types/scanner';

interface ResultsViewProps {
  data: AnalyzeLabelResponse;
  imageSrc?: string;
  imageSrcs?: string[];
  onReset: () => void;
}

const BoundedImagePreview: React.FC<{
  src: string;
  ocrLines?: OCRLine[];
}> = ({ src, ocrLines }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawCanvas = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !img.naturalWidth || !img.naturalHeight) return;

    const rect = img.getBoundingClientRect();
    const renderedWidth = rect.width;
    const renderedHeight = rect.height;
    if (!renderedWidth || !renderedHeight) return;

    canvas.width = renderedWidth;
    canvas.height = renderedHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, renderedWidth, renderedHeight);

    if (!ocrLines || ocrLines.length === 0) return;

    const scaleX = renderedWidth / img.naturalWidth;
    const scaleY = renderedHeight / img.naturalHeight;

    ocrLines.forEach((line) => {
      const pts = line?.box;
      if (!Array.isArray(pts) || pts.length < 3) return;
      const first = pts[0];
      if (!Array.isArray(first) || first.length < 2) return;
      const x0 = Number(first[0]);
      const y0 = Number(first[1]);
      if (!Number.isFinite(x0) || !Number.isFinite(y0)) return;

      ctx.beginPath();
      ctx.moveTo(x0 * scaleX, y0 * scaleY);
      for (let i = 1; i < pts.length; i++) {
        const pt = pts[i];
        if (!Array.isArray(pt) || pt.length < 2) continue;
        const x = Number(pt[0]);
        const y = Number(pt[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        ctx.lineTo(x * scaleX, y * scaleY);
      }
      ctx.closePath();

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#06B6D4';
      ctx.fillStyle = 'rgba(6, 182, 212, 0.15)';
      ctx.fill();
      ctx.stroke();
    });
  }, [ocrLines]);

  useEffect(() => {
    drawCanvas();
    const handleResize = () => drawCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawCanvas]);

  return (
    <div style={{ position: 'relative', width: '100%', overflow: 'hidden', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
      <img
        ref={imgRef}
        src={src}
        alt="Scanned product label"
        onLoad={drawCanvas}
        style={{ width: '100%', display: 'block', objectFit: 'contain', maxHeight: '280px' }}
      />
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />
    </div>
  );
};

function linesForPreview(
  data: AnalyzeLabelResponse,
  previewIndex: number,
  previewCount: number,
): OCRLine[] {
  const perImage = data.images?.[previewIndex]?.ocr_lines;
  if (Array.isArray(perImage) && perImage.length) {
    return perImage;
  }
  const all = Array.isArray(data.ocr_lines) ? data.ocr_lines : [];
  if (!all.length) return [];
  const tagged = all.some((line) => typeof line?.image_index === 'number');
  if (tagged) {
    return all.filter((line) => line.image_index === previewIndex);
  }
  return previewCount <= 1 || previewIndex === 0 ? all : [];
}

export const ResultsView: React.FC<ResultsViewProps> = ({ data, imageSrc, imageSrcs, onReset }) => {
  const [showRawText, setShowRawText] = useState(false);
  const compliance_report = data?.compliance_report;
  const parsed_declarations = data?.parsed_declarations ?? {};
  const raw_text = data?.raw_text;
  const warning = data?.warning;
  const isCompliant = Boolean(compliance_report?.is_compliant);
  const previews = imageSrcs?.length ? imageSrcs : imageSrc ? [imageSrc] : [];
  const score = compliance_report?.compliance_score ?? 0;
  const rules = compliance_report?.rules ?? [];

  const nestedReadability = (compliance_report as { parsed_declarations?: ParsedDeclarations } | undefined)
    ?.parsed_declarations?.readability_analysis;
  const readability = parsed_declarations?.readability_analysis ?? nestedReadability;
  const readabilityIssues = Array.isArray(readability?.issues) ? readability.issues : [];
  const hasReadabilityWarning =
    (readability && readability.meets_minimum_readability === false) || readabilityIssues.length > 0;

  return (
    <div style={{ maxWidth: '960px', margin: '30px auto', padding: '0 20px', paddingBottom: '60px' }}>
      
      {/* 1. TOP OVERALL STATUS BANNER */}
      <div 
        className={isCompliant ? 'badge-compliant' : 'badge-violation'}
        style={{
          borderRadius: 'var(--radius-lg)',
          padding: '24px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '28px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {isCompliant ? (
            <CheckCircle2 size={44} color="#10B981" />
          ) : (
            <XCircle size={44} color="#F43F5E" />
          )}
          <div>
            <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800, opacity: 0.9 }}>
              STATUTORY COMPLIANCE STATUS
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '2px 0 4px' }}>
              {isCompliant ? 'FULLY COMPLIANT' : 'NON-COMPLIANT (VIOLATIONS DETECTED)'}
            </h2>
            <p style={{ fontSize: '0.95rem', opacity: 0.95, fontWeight: 500 }}>
              Compliance score {score}% · {compliance_report?.summary ?? ''}
            </p>
          </div>
        </div>

        <button 
          onClick={onReset} 
          className="btn-secondary" 
          style={{ 
            background: isCompliant ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
            border: `1px solid ${isCompliant ? '#10B981' : '#F43F5E'}`,
            color: '#fff',
            fontWeight: 700
          }}
        >
          <RotateCcw size={16} /> Scan Another Label
        </button>
      </div>

      {/* READABILITY WARNING ALERT BADGE */}
      {hasReadabilityWarning && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.15)',
          border: '1px solid rgba(245, 158, 11, 0.5)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          marginBottom: '24px',
          color: '#FBBF24',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1rem', fontWeight: 800 }}>
            <AlertTriangle size={22} color="#F59E0B" />
            <span>⚠️ Readability Warning: Text size may be legally too small.</span>
          </div>
          {readabilityIssues.length > 0 && (
            <ul style={{ marginTop: '10px', paddingLeft: '24px', fontSize: '0.9rem', color: '#FDE68A' }}>
              {readabilityIssues.map((issue, idx) => (
                <li key={idx} style={{ marginBottom: '4px' }}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* LOW OCR CONFIDENCE WARNING BANNER */}
      {warning && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 20px',
          marginBottom: '24px',
          color: '#FCA5A5',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontWeight: 700,
          fontSize: '0.95rem'
        }}>
          <AlertTriangle size={22} color="#EF4444" />
          <span>⚠️ {warning}</span>
        </div>
      )}

      {/* 2. STATS OVERVIEW CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Compliance Score</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
            {score}%
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '20px', textAlign: 'center', borderColor: 'var(--compliant-border)', background: 'var(--compliant-bg)' }}>
          <div style={{ fontSize: '0.8rem', color: '#10B981', fontWeight: 600 }}>Passed Statutory Rules</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10B981', marginTop: '4px' }}>
            {rules.filter((r) => r.passed).length}
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '20px', textAlign: 'center', borderColor: 'var(--violation-border)', background: 'var(--violation-bg)' }}>
          <div style={{ fontSize: '0.8rem', color: '#F43F5E', fontWeight: 600 }}>Violations / Non-Compliant</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#F43F5E', marginTop: '4px' }}>
            {compliance_report?.failed_rules_count ?? rules.filter((r) => !r.passed).length}
          </div>
        </div>
      </div>

      {/* MAIN TWO-COLUMN GRID: Left = Image & Extracted Fields, Right = Rule Evaluation */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)', gap: '24px', alignItems: 'start' }} className="results-grid">
        
        {/* LEFT COLUMN: Cropped Image & Extracted Mandatory 6 Declarations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Scanned Image Preview */}
          <div className="glass-panel" style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Scanned Package Image{previews.length > 1 ? 's' : ''} (with OCR Text Detection)
            </h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              {previews.map((src, index) => (
                <BoundedImagePreview
                  key={src}
                  src={src}
                  ocrLines={linesForPreview(data, index, previews.length)}
                />
              ))}
            </div>
          </div>

          {/* 6 Mandatory Declarations Summary */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} color="var(--accent-indigo)" /> 6 Mandatory Statutory Declarations
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.88rem' }}>
              {/* 1. Manufacturer */}
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, display: 'block' }}>1. MANUFACTURER / PACKER</span>
                <span style={{ fontWeight: 600 }}>{parsed_declarations.manufacturer_details?.name || 'Not detected'}</span>
                {parsed_declarations.manufacturer_details?.address && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '2px' }}>
                    {parsed_declarations.manufacturer_details.address}
                  </div>
                )}
              </div>

              {/* 2. Commodity Name */}
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, display: 'block' }}>2. GENERIC NAME OF COMMODITY</span>
                <span style={{ fontWeight: 600 }}>{parsed_declarations.commodity_name?.name || 'Not detected'}</span>
              </div>

              {/* 3. Net Quantity */}
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, display: 'block' }}>3. NET QUANTITY</span>
                <span style={{ fontWeight: 600 }}>{parsed_declarations.net_quantity?.value || 'Not detected'}</span>
                {parsed_declarations.net_quantity?.unit && (
                  <span style={{ marginLeft: '6px', fontSize: '0.8rem', color: parsed_declarations.net_quantity.is_standard_unit ? '#10B981' : '#F43F5E' }}>
                    ({parsed_declarations.net_quantity.is_standard_unit ? 'Standard Unit' : 'Non-standard Unit'})
                  </span>
                )}
              </div>

              {/* 4. Month & Year */}
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, display: 'block' }}>4. MONTH & YEAR OF MFG / PACKING</span>
                <span style={{ fontWeight: 600 }}>{parsed_declarations.manufacture_date?.raw_declaration || 'Not detected'}</span>
              </div>

              {/* 5. MRP */}
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, display: 'block' }}>5. RETAIL SALE PRICE (MRP)</span>
                <span style={{ fontWeight: 600 }}>{parsed_declarations.mrp_details?.value || 'Not detected'}</span>
                {parsed_declarations.mrp_details?.stamped_override_detected && (
                  <div style={{ color: '#F43F5E', fontSize: '0.75rem', fontWeight: 700, marginTop: '2px' }}>
                    ⚠ Stamped price override detected!
                  </div>
                )}
              </div>

              {/* 6. Consumer Care */}
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, display: 'block' }}>6. CONSUMER CARE CONTACT</span>
                <div style={{ fontWeight: 600 }}>
                  {parsed_declarations.consumer_care?.email || parsed_declarations.consumer_care?.phone || parsed_declarations.consumer_care?.address ? (
                    <div>
                      {parsed_declarations.consumer_care?.email && <div>Email: {parsed_declarations.consumer_care.email}</div>}
                      {parsed_declarations.consumer_care?.phone && <div>Phone: {parsed_declarations.consumer_care.phone}</div>}
                    </div>
                  ) : (
                    'Not detected'
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Color-Coded Statutory Rules Breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Rule-by-Rule Compliance Evaluation</h3>

          {rules.map((rule) => {
            const isRulePassed = rule.passed;
            return (
              <div
                key={rule.rule_id}
                className="glass-panel"
                style={{
                  padding: '16px 20px',
                  borderRadius: 'var(--radius-md)',
                  borderLeft: `5px solid ${isRulePassed ? '#10B981' : '#F43F5E'}`,
                  background: isRulePassed ? 'rgba(16, 185, 129, 0.04)' : 'rgba(244, 63, 94, 0.06)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{rule.rule_id}: {rule.rule_name}</span>
                  </div>

                  {/* Status Pill Tag */}
                  <div 
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      background: isRulePassed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                      color: isRulePassed ? '#10B981' : '#F43F5E',
                      border: `1px solid ${isRulePassed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`
                    }}
                  >
                    {isRulePassed ? (
                      <>
                        <CheckCircle2 size={13} /> PASS
                      </>
                    ) : (
                      <>
                        <XCircle size={13} /> VIOLATION
                      </>
                    )}
                  </div>
                </div>

                {!isRulePassed && rule.reason && (
                  <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '6px', background: 'rgba(244, 63, 94, 0.12)', color: '#FDA4AF', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={15} color="#F43F5E" />
                    <span>Violation details: {rule.reason}</span>
                  </div>
                )}

                {isRulePassed && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
                    Statutory declaration verified and compliant.
                  </div>
                )}
              </div>
            );
          })}

          {/* Raw OCR Text Inspector Accordion */}
          <div className="glass-panel" style={{ padding: '16px', marginTop: '10px' }}>
            <button
              onClick={() => setShowRawText(!showRawText)}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer'
              }}
            >
              <span>Inspect Extracted Raw OCR Text</span>
              {showRawText ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showRawText && (
              <pre style={{
                marginTop: '12px',
                padding: '14px',
                background: '#04070F',
                borderRadius: '6px',
                color: '#A7F3D0',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'pre-wrap',
                maxHeight: '200px',
                overflowY: 'auto',
                border: '1px solid var(--border-subtle)'
              }}>
                {raw_text || 'No raw OCR text detected.'}
              </pre>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
