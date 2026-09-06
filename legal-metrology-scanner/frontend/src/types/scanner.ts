export interface ComplianceRule {
  rule_id: string;
  rule_name: string;
  status: 'PASS' | 'FAIL';
  passed: boolean;
  reason?: string | null;
}

export interface ComplianceReport {
  overall_status: 'COMPLIANT' | 'NON_COMPLIANT';
  is_compliant: boolean;
  compliance_score: number;
  rules: ComplianceRule[];
  failed_rules_count: number;
  summary: string;
  formatted_text_report: string;
}

export interface ParsedDeclarations {
  manufacturer_details?: {
    present: boolean;
    name?: string | null;
    address?: string | null;
  };
  commodity_name?: {
    present: boolean;
    name?: string | null;
  };
  net_quantity?: {
    present: boolean;
    value?: string | null;
    unit?: string | null;
    is_standard_unit?: boolean;
  };
  manufacture_date?: {
    present: boolean;
    raw_declaration?: string | null;
  };
  mrp_details?: {
    present: boolean;
    value?: string | null;
    is_properly_formatted?: boolean;
    stamped_override_detected?: boolean;
    override_details?: string | null;
    inclusive_of_all_taxes?: boolean;
  };
  consumer_care?: {
    present: boolean;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    missing_components?: string[];
  };
  readability_analysis?: {
    meets_minimum_readability: boolean;
    issues?: string[];
  };
}

export interface AnalyzeLabelResponse {
  filename: string;
  filenames?: string[];
  image_count?: number;
  raw_text: string;
  parsed_declarations: ParsedDeclarations;
  compliance_report: ComplianceReport;
  parser_backend?: string;
  llm_configured?: boolean;
  scan_id?: number | null;
}

export type ScannerStep = 'CAPTURE' | 'CROP' | 'REVIEW' | 'ANALYZING' | 'RESULTS';

export interface QueuedLabel {
  id: string;
  src: string;
  blob: Blob;
  label: string;
}
