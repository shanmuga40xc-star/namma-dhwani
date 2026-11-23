import { DuplicateCandidate, IncidentCategory, SeverityLevel } from '../types/civic';

export interface ClassifyApiResponse {
  predicted_category: IncidentCategory;
  confidence: number;
  predicted_severity: SeverityLevel;
  severity_confidence?: number;
  class_probabilities?: Record<string, number>;
  visual_reason?: string;
  model_version?: string;
  architecture?: string;
  ai_source: 'fastapi_ml' | 'fallback_rule_based';
  fallback_used: boolean;
  lifecycle_state?: string;
  fallback_notice?: string;
}

export interface DetectDuplicatesApiResponse {
  radius_meters: number;
  auto_group_policy_enabled: boolean;
  candidates: DuplicateCandidate[];
  ai_source: 'fastapi_ml' | 'fallback_rule_based';
  fallback_used: boolean;
  fallback_notice?: string;
}

export interface PriorityScoreApiResponse {
  priority_score: number;
  priority_tier: SeverityLevel;
  scoring_source: 'sklearn_ml' | 'rule_based_baseline';
  lifecycle_state?: string;
  ml_model_trained?: boolean;
  fallback_used?: boolean;
  influencing_factors: string[];
  fallback_notice?: string;
}

export interface VerifyResolutionApiResponse {
  ai_recommendation:
    | 'Likely Resolved'
    | 'Needs Manual Review'
    | 'Suspicious Evidence';
  explanation: string;
  gps_validation: {
    distance_meters: number;
    threshold_meters: number;
    gps_suspicious: boolean;
    gps_status: string;
  };
  image_comparison: {
    image_similarity: number;
    ssim_score: number;
    orb_scene_alignment: number;
    clip_embedding_used: boolean;
  };
  ai_source: 'fastapi_ml' | 'fallback_rule_based';
  fallback_used: boolean;
}

export interface ModelStatusApiResponse {
  service_available: boolean;
  runtime_engine?: string;
  upstream_error?: string;
  classification: {
    objective: string;
    lifecycle_state: string;
    checkpoint_present: boolean;
    model_version?: string;
    architecture?: string;
    training_pending_reason?: string;
  };
  duplicate_detection: {
    objective: string;
    lifecycle_state: string;
    fallback_active?: boolean;
    default_radius_meters: number;
    clip_available?: boolean;
    sentence_transformer_available?: boolean;
  };
  priority_scoring: {
    objective: string;
    lifecycle_state: string;
    fallback_mode?: string;
    model_version?: string;
  };
  resolution_verification: {
    objective: string;
    lifecycle_state: string;
    fallback_active?: boolean;
    opencv_available?: boolean;
    clip_available?: boolean;
  };
}

export interface EvaluationApiResponse {
  service_available: boolean;
  classification: {
    lifecycle_state: string;
    metrics: Record<string, unknown> | null;
    confusion_matrix: number[][] | null;
    class_labels?: string[];
    history?: {
      epochs: number[];
      train_loss: number[];
      val_loss: number[];
      val_accuracy: number[];
    } | null;
    message?: string;
  };
  priority_scoring: {
    lifecycle_state: string;
    metrics: Record<string, unknown> | null;
    feature_importance: Array<{ feature: string; importance: number }> | null;
    confusion_matrix: number[][] | null;
    message?: string;
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error((data as { error?: string }).error || `AI gateway error (${resp.status})`);
  }
  return data as T;
}

export async function classifyCivicPhoto(
  imageBase64: string,
  hintText = ''
): Promise<ClassifyApiResponse> {
  return postJson<ClassifyApiResponse>('/api/ai/classify', {
    image_base64: imageBase64,
    hint_text: hintText,
  });
}

export async function detectDuplicateComplaints(payload: {
  new_complaint: {
    id?: string;
    title: string;
    description: string;
    category: string;
    locality: string;
    latitude: number;
    longitude: number;
    photo_base64?: string;
  };
  existing_complaints: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    locality: string;
    latitude: number;
    longitude: number;
    photo_base64?: string;
  }>;
  radius_meters: number;
  auto_group_policy_enabled: boolean;
}): Promise<DetectDuplicatesApiResponse> {
  return postJson<DetectDuplicatesApiResponse>('/api/ai/detect-duplicates', payload);
}

export async function scoreComplaintPriority(payload: {
  severity: SeverityLevel;
  category: IncidentCategory;
  unique_supports: number;
  age_hours: number;
  locality: string;
  duplicate_count: number;
  ward_avg_res_hours?: number;
}): Promise<PriorityScoreApiResponse> {
  return postJson<PriorityScoreApiResponse>('/api/ai/priority-score', payload);
}

export async function verifyResolutionEvidence(payload: {
  before_image_base64: string;
  after_image_base64: string;
  original_latitude: number;
  original_longitude: number;
  resolution_latitude: number;
  resolution_longitude: number;
}): Promise<VerifyResolutionApiResponse> {
  return postJson<VerifyResolutionApiResponse>('/api/ai/verify-resolution', payload);
}

export async function fetchAiModelStatus(): Promise<ModelStatusApiResponse> {
  const resp = await fetch('/api/ai/model-status');
  if (!resp.ok) throw new Error(`Failed to load model status (${resp.status})`);
  return resp.json() as Promise<ModelStatusApiResponse>;
}

export async function fetchAiEvaluationReports(): Promise<EvaluationApiResponse> {
  const resp = await fetch('/api/ai/evaluation');
  if (!resp.ok) throw new Error(`Failed to load evaluation reports (${resp.status})`);
  return resp.json() as Promise<EvaluationApiResponse>;
}
