import React, { useEffect, useState } from 'react';
import { Activity, Cpu, Database, FlaskConical, RefreshCw } from 'lucide-react';
import {
  fetchAiEvaluationReports,
  fetchAiModelStatus,
  type EvaluationApiResponse,
  type ModelStatusApiResponse,
} from '../services/aiClient';
import { createResearchExperiment } from '../services/firestoreService';
import { ResearchExperimentRecord } from '../types/civic';

interface AiEvaluationResearchScreenProps {
  experiments: ResearchExperimentRecord[];
  adminUid: string;
  onShowToast: (msg: string) => void;
}

export const AiEvaluationResearchScreen: React.FC<AiEvaluationResearchScreenProps> = ({
  experiments,
  adminUid,
  onShowToast,
}) => {
  const [modelStatus, setModelStatus] = useState<ModelStatusApiResponse | null>(null);
  const [evalReport, setEvalReport] = useState<EvaluationApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Experiment logger form
  const [objectiveName, setObjectiveName] = useState(
    'Objective 1: Photo Issue Classification'
  );
  const [datasetSource, setDatasetSource] = useState('');
  const [datasetSize, setDatasetSize] = useState<number>(0);
  const [imagesPerCategory, setImagesPerCategory] = useState('');
  const [trainValSplit, setTrainValSplit] = useState('70% / 15% / 15%');
  const [modelArchitecture, setModelArchitecture] = useState('MobileNetV3-Small (PyTorch)');
  const [hyperparameters, setHyperparameters] = useState(
    'epochs=15, lr=0.0003, batch_size=32, AdamW'
  );
  const [trainingDate, setTrainingDate] = useState(new Date().toISOString().slice(0, 10));
  const [modelVersion, setModelVersion] = useState('v0.1.0-untrained');
  const [lifecycleState, setLifecycleState] =
    useState<ResearchExperimentRecord['lifecycleState']>('implemented_not_trained');
  const [evaluationMetrics, setEvaluationMetrics] = useState('');
  const [confusionMatrix, setConfusionMatrix] = useState('');
  const [limitations, setLimitations] = useState(
    'Image alone cannot measure subterranean pipe burst volume or social urgency without citizen context.'
  );
  const [savingExp, setSavingExp] = useState(false);

  const loadAiStatus = async () => {
    setLoading(true);
    try {
      const [statusData, evalData] = await Promise.all([
        fetchAiModelStatus(),
        fetchAiEvaluationReports(),
      ]);
      setModelStatus(statusData);
      setEvalReport(evalData);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Unable to reach AI gateway.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAiStatus();
  }, []);

  const handleSaveExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!datasetSource.trim()) {
      onShowToast('Specify the real dataset source before logging an experiment.');
      return;
    }
    setSavingExp(true);
    try {
      await createResearchExperiment({
        objectiveName,
        datasetSource,
        datasetSize,
        imagesPerCategory,
        trainValSplit,
        modelArchitecture,
        hyperparameters,
        trainingDate,
        modelVersion,
        lifecycleState,
        evaluationMetrics,
        confusionMatrix,
        limitations,
        recordedByUid: adminUid,
      });
      onShowToast('Research experiment metadata recorded in Firestore.');
      setDatasetSource('');
      setEvaluationMetrics('');
      setConfusionMatrix('');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to log research experiment.');
    } finally {
      setSavingExp(false);
    }
  };

  const renderLifecyclePill = (state: string) => {
    if (state === 'deployed_active' || state === 'trained_evaluated') {
      return (
        <span className="rounded border border-[#168B55] bg-[#E8F5EC] px-2 py-0.5 font-mono-tabular text-[10px] font-bold uppercase text-[#168B55]">
          {state}
        </span>
      );
    }
    return (
      <span className="rounded border border-[#F2A541] bg-[#FEF5E7] px-2 py-0.5 font-mono-tabular text-[10px] font-bold uppercase text-[#8A5208]">
        {state}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.01em] text-[#0A1D2B] sm:text-[32px] sm:leading-[40px]">
            AI/ML Evaluation &amp; Research Reporting
          </h1>
          <p className="mt-1 text-sm text-[#43474D]">
            Transparent model lifecycle verification across all four NAGRIK objectives. Metrics are
            displayed only from genuine evaluation artifacts — zero fabricated accuracy claims.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAiStatus}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded border border-[#102A43] bg-white px-4 text-xs font-semibold text-[#102A43] hover:bg-[#ECF4FF] cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh AI Model Status
        </button>
      </div>

      {/* Live AI Engine Connectivity Banner */}
      {modelStatus && (
        <div
          className={`rounded-lg border p-4 text-xs ${
            modelStatus.service_available
              ? 'border-[#168B55] bg-[#E8F5EC] text-[#168B55]'
              : 'border-[#F2A541] bg-[#FEF5E7] text-[#8A5208]'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
            <span className="inline-flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              NAGRIK Trained AI/ML Engine:{' '}
              {modelStatus.service_available
                ? 'ACTIVE — TRAINED WEIGHTS & REAL EVALUATION ARTIFACTS LOADED'
                : 'OFFLINE / FALLBACK MODE ACTIVE'}
            </span>
            <span className="font-mono-tabular">Gateway: /api/ai/*</span>
          </div>
          {modelStatus.service_available ? (
            <p className="mt-1">
              Objective 1 (30-Feature Bilinear Spatial CV + 48-Unit Adam MLP), Objective 2
              (Haversine + dHash + RGB Cosine + Civic Synonym Hybrid Text), Objective 3 (28-Tree
              Random Forest), and Objective 4 (SSIM + Luminance + Border Alignment + 250m GPS
              Gate) are executing live against trained artifacts in{' '}
              <code className="font-mono-tabular">ai-services/models/</code>.
            </p>
          ) : (
            <p className="mt-1">
              {modelStatus.upstream_error || 'Run model training script to generate checkpoints.'}{' '}
              Run{' '}
              <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono-tabular">
                npx tsx server/ml/trainModels.ts
              </code>{' '}
              to train and evaluate models.
            </p>
          )}
        </div>
      )}

      {/* 4 Objective Lifecycle Cards */}
      {modelStatus && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-[#102A43]/10 bg-white p-5 civic-shadow-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
                {modelStatus.classification.objective}
              </h2>
              {renderLifecyclePill(modelStatus.classification.lifecycle_state)}
            </div>
            <p className="mt-2 text-xs text-[#43474D]">
              Checkpoint present:{' '}
              <strong className="font-mono-tabular">
                {String(modelStatus.classification.checkpoint_present)}
              </strong>
              {modelStatus.classification.model_version
                ? ` · ${modelStatus.classification.model_version}`
                : ''}
              {modelStatus.classification.architecture
                ? ` · ${modelStatus.classification.architecture}`
                : ''}
            </p>
            {modelStatus.classification.training_pending_reason && (
              <p className="mt-2 rounded bg-[#F5F7FA] p-2.5 text-[11px] text-[#52606D]">
                {modelStatus.classification.training_pending_reason}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-[#102A43]/10 bg-white p-5 civic-shadow-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
                {modelStatus.duplicate_detection.objective}
              </h2>
              {renderLifecyclePill(modelStatus.duplicate_detection.lifecycle_state)}
            </div>
            <p className="mt-2 text-xs text-[#43474D]">
              Default Haversine radius:{' '}
              <strong className="font-mono-tabular">
                {modelStatus.duplicate_detection.default_radius_meters}m
              </strong>{' '}
              · Visual 64-bit dHash + RGB Cosine + Civic Synonym Jaccard/3-Gram Dice.
            </p>
          </div>

          <div className="rounded-lg border border-[#102A43]/10 bg-white p-5 civic-shadow-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
                {modelStatus.priority_scoring.objective}
              </h2>
              {renderLifecyclePill(modelStatus.priority_scoring.lifecycle_state)}
            </div>
            <p className="mt-2 text-xs text-[#43474D]">
              Scoring mode:{' '}
              <strong className="font-mono-tabular">
                {modelStatus.priority_scoring.fallback_mode || 'random_forest_28_trees_ml'}
              </strong>
              {modelStatus.priority_scoring.model_version
                ? ` · ${modelStatus.priority_scoring.model_version}`
                : ''}
            </p>
          </div>

          <div className="rounded-lg border border-[#102A43]/10 bg-white p-5 civic-shadow-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
                {modelStatus.resolution_verification.objective}
              </h2>
              {renderLifecyclePill(modelStatus.resolution_verification.lifecycle_state)}
            </div>
            <p className="mt-2 text-xs text-[#43474D]">
              Structural SSIM + Street Border Alignment + Luminance Delta + Haversine GPS threshold (250m).
            </p>
          </div>
        </section>
      )}

      {/* How the 4 AI/ML Models Actually Work (Pipeline Breakdown) */}
      <section className="rounded-lg border border-[#102A43]/10 bg-white p-5 civic-shadow-1">
        <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-3">
          <Cpu className="h-4 w-4 text-[#102A43]" />
          <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
            How All 4 AI/ML Models Work in Production (Input → Computation → Output)
          </h2>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-xs">
            <div className="font-bold text-[#102A43]">
              1. Issue &amp; Severity Classification (Objective 1 — `/api/ai/classify`)
            </div>
            <p className="mt-1.5 text-[#43474D]">
              Decodes JPEG/PNG bytes → resamples to <strong>64×64 bilinear RGBA</strong> →
              extracts <strong>30 spatial CV features</strong> separating the upper sky zone
              (sky coverage, thin dark poles/wires against sky, warm lamp glow, upper Sobel edge)
              from the lower ground zone (asphalt, water-cyan hue, ground specular puddle sheen,
              central crater dark contrast, 4×4 patch variance, hue entropy). Two{' '}
              <strong>48-unit LeakyReLU Adam MLPs</strong> with temperature-calibrated Softmax
              predict the civic category + urgency and return a plain-English visual reason.
            </p>
          </div>

          <div className="rounded border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-xs">
            <div className="font-bold text-[#102A43]">
              2. Multimodal Duplicate Detection (Objective 2 — `/api/ai/detect-duplicates`)
            </div>
            <p className="mt-1.5 text-[#43474D]">
              Filters open reports within a <strong>100m Haversine GPS radius</strong>, then fuses
              4 signals: GPS proximity (<code className="font-mono-tabular">0.35</code>), civic
              synonym-normalized Jaccard + char-3gram Dice text match (
              <code className="font-mono-tabular">0.30</code>), 64-bit dHash + 24-bin RGB
              histogram cosine visual match (<code className="font-mono-tabular">0.20</code>), and
              category agreement (<code className="font-mono-tabular">0.15</code>). Flags matches
              ≥ 0.40 and requires human admin confirmation unless auto-group policy is explicitly
              enabled.
            </p>
          </div>

          <div className="rounded border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-xs">
            <div className="font-bold text-[#102A43]">
              3. Priority Scoring Engine (Objective 3 — `/api/ai/priority-score`)
            </div>
            <p className="mt-1.5 text-[#43474D]">
              Encodes 6 civic features (severity 1–4, category hazard weight 1–4, capped unique
              supports, age hours, duplicate cluster count, ward SLA avg hours) into a{' '}
              <strong>trained 28-tree CART Random Forest Regressor</strong>. Outputs a 0–100 urgency
              score, maps to Low/Medium/High/Critical tier, and surfaces exact contributing
              factors for accountability.
            </p>
          </div>

          <div className="rounded border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-xs">
            <div className="font-bold text-[#102A43]">
              4. Resolution Verification Gate (Objective 4 — `/api/ai/verify-resolution`)
            </div>
            <p className="mt-1.5 text-[#43474D]">
              Validates repair crew GPS against complaint origin (flags &gt;250m as{' '}
              <em>Suspicious Evidence</em>), compares Before vs After photos via{' '}
              <strong>64×64 SSIM luminance-contrast-structure</strong>, dHash, RGB cosine, and outer
              street-border alignment. Blocks fake identical-photo closures (SSIM &gt; 0.96) and
              tracks citizen confirmation vs re-open disputes.
            </p>
          </div>
        </div>
      </section>

      {/* Evaluation Metrics Panels (Real Artifacts Only) */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-[#102A43]/10 bg-white p-5 civic-shadow-1">
          <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-3">
            <Activity className="h-4 w-4 text-[#102A43]" />
            <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
              Objective 1 Evaluation Report (Classification &amp; Confusion Matrix)
            </h2>
          </div>

          {evalReport?.classification.metrics ? (
            <div className="mt-4 flex flex-col gap-3 text-xs">
              <pre className="overflow-x-auto rounded bg-[#F5F7FA] p-3 font-mono-tabular text-[11px] text-[#0A1D2B]">
                {JSON.stringify(evalReport.classification.metrics, null, 2)}
              </pre>
              {evalReport.classification.confusion_matrix && (
                <div>
                  <div className="font-bold text-[#253746]">
                    Held-Out Test Confusion Matrix{' '}
                    {evalReport.classification.class_labels
                      ? `(${evalReport.classification.class_labels.join(' | ')})`
                      : ''}
                  </div>
                  <div className="mt-1.5 overflow-x-auto rounded border border-[#E2E8F0]">
                    <table className="w-full text-center font-mono-tabular text-[11px]">
                      <thead className="bg-[#F5F7FA] text-[#52606D]">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Actual \ Pred</th>
                          {(evalReport.classification.class_labels || ['C0', 'C1', 'C2', 'C3']).map(
                            (lbl) => (
                              <th key={lbl} className="px-2 py-1.5">
                                {lbl.split(' ')[0]}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {evalReport.classification.confusion_matrix.map((row, rIdx) => (
                          <tr key={rIdx}>
                            <td className="bg-[#F5F7FA] px-2 py-1.5 text-left font-bold text-[#0A1D2B]">
                              {(evalReport.classification.class_labels?.[rIdx] || `C${rIdx}`).split(
                                ' '
                              )[0]}
                            </td>
                            {row.map((cell, cIdx) => (
                              <td
                                key={cIdx}
                                className={`px-2 py-1.5 ${
                                  rIdx === cIdx
                                    ? 'bg-[#E8F5EC] font-bold text-[#168B55]'
                                    : cell > 0
                                      ? 'text-[#BA1A1A]'
                                      : 'text-[#52606D]'
                                }`}
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded border border-dashed border-[#CBD5E1] bg-[#F5F7FA] p-4 text-xs text-[#43474D]">
              <div className="font-semibold text-[#0A1D2B]">
                Training pending labelled dataset preparation
              </div>
              <p className="mt-1">
                {evalReport?.classification.message ||
                  'No evaluation artifact found. Place labelled training/validation/test images in ai-services/datasets/civic_issues/ and run:'}
              </p>
              <code className="mt-2 block rounded bg-white px-2.5 py-1.5 font-mono-tabular text-[11px] text-[#102A43]">
                python -m classification.train --data-dir datasets/civic_issues --arch mobilenet_v3
              </code>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[#102A43]/10 bg-white p-5 civic-shadow-1">
          <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-3">
            <Database className="h-4 w-4 text-[#102A43]" />
            <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
              Objective 3 Evaluation Report (Priority Scoring &amp; Feature Importance)
            </h2>
          </div>

          {evalReport?.priority_scoring.metrics ? (
            <div className="mt-4 flex flex-col gap-3 text-xs">
              <pre className="overflow-x-auto rounded bg-[#F5F7FA] p-3 font-mono-tabular text-[11px] text-[#0A1D2B]">
                {JSON.stringify(evalReport.priority_scoring.metrics, null, 2)}
              </pre>
              {evalReport.priority_scoring.feature_importance && (
                <div className="flex flex-col gap-1.5">
                  <div className="font-bold text-[#253746]">Feature Importance</div>
                  {evalReport.priority_scoring.feature_importance.map((f) => (
                    <div key={f.feature} className="flex items-center gap-2">
                      <span className="w-40 truncate font-mono-tabular text-[11px]">
                        {f.feature}
                      </span>
                      <div className="h-2 flex-1 rounded-full bg-[#E2E8F0]">
                        <div
                          className="h-full rounded-full bg-[#102A43]"
                          style={{ width: `${Math.min(100, Math.round(f.importance * 100))}%` }}
                        />
                      </div>
                      <span className="w-12 text-right font-mono-tabular text-[11px]">
                        {(f.importance * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded border border-dashed border-[#CBD5E1] bg-[#F5F7FA] p-4 text-xs text-[#43474D]">
              <div className="font-semibold text-[#0A1D2B]">
                Training pending historical labelled dataset
              </div>
              <p className="mt-1">
                {evalReport?.priority_scoring.message ||
                  'Transparent rule-based baseline is active until historical priority CSV data is trained:'}
              </p>
              <code className="mt-2 block rounded bg-white px-2.5 py-1.5 font-mono-tabular text-[11px] text-[#102A43]">
                python -m priority_scoring.train --csv datasets/priority_history.csv
              </code>
            </div>
          )}
        </div>
      </section>

      {/* Research Experiment Logger & Firestore Ledger */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form
          onSubmit={handleSaveExperiment}
          className="rounded-lg border border-[#102A43]/10 bg-white p-5 civic-shadow-1 lg:col-span-5"
        >
          <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-3">
            <FlaskConical className="h-4 w-4 text-[#102A43]" />
            <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
              Log Research Experiment to Firestore
            </h2>
          </div>

          <div className="mt-4 flex flex-col gap-3 text-xs">
            <div>
              <label className="block font-bold uppercase text-[#253746]">Objective</label>
              <select
                value={objectiveName}
                onChange={(e) => setObjectiveName(e.target.value)}
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-2.5"
              >
                <option value="Objective 1: Photo Issue Classification">
                  Objective 1: Photo Issue Classification
                </option>
                <option value="Objective 2: Multimodal Duplicate Detection">
                  Objective 2: Multimodal Duplicate Detection
                </option>
                <option value="Objective 3: ML Priority Scoring">
                  Objective 3: ML Priority Scoring
                </option>
                <option value="Objective 4: Resolution Verification">
                  Objective 4: Resolution Verification
                </option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold uppercase text-[#253746]">Dataset Source *</label>
                <input
                  type="text"
                  value={datasetSource}
                  onChange={(e) => setDatasetSource(e.target.value)}
                  placeholder="e.g., Municipal Audit 2026"
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] px-2.5"
                />
              </div>
              <div>
                <label className="block font-bold uppercase text-[#253746]">Dataset Size</label>
                <input
                  type="number"
                  min={0}
                  value={datasetSize}
                  onChange={(e) => setDatasetSize(Number(e.target.value))}
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] px-2.5 font-mono-tabular"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold uppercase text-[#253746]">Architecture</label>
                <input
                  type="text"
                  value={modelArchitecture}
                  onChange={(e) => setModelArchitecture(e.target.value)}
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] px-2.5"
                />
              </div>
              <div>
                <label className="block font-bold uppercase text-[#253746]">Lifecycle State</label>
                <select
                  value={lifecycleState}
                  onChange={(e) =>
                    setLifecycleState(
                      e.target.value as ResearchExperimentRecord['lifecycleState']
                    )
                  }
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] bg-white px-2.5"
                >
                  <option value="implemented_not_trained">implemented_not_trained</option>
                  <option value="trained_evaluated">trained_evaluated</option>
                  <option value="deployed_active">deployed_active</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold uppercase text-[#253746]">Split</label>
                <input
                  type="text"
                  value={trainValSplit}
                  onChange={(e) => setTrainValSplit(e.target.value)}
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] px-2.5"
                />
              </div>
              <div>
                <label className="block font-bold uppercase text-[#253746]">Model Version</label>
                <input
                  type="text"
                  value={modelVersion}
                  onChange={(e) => setModelVersion(e.target.value)}
                  className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] px-2.5 font-mono-tabular"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold uppercase text-[#253746]">Hyperparameters</label>
              <input
                type="text"
                value={hyperparameters}
                onChange={(e) => setHyperparameters(e.target.value)}
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] px-2.5"
              />
            </div>

            <div>
              <label className="block font-bold uppercase text-[#253746]">
                Images per Category (optional)
              </label>
              <input
                type="text"
                value={imagesPerCategory}
                onChange={(e) => setImagesPerCategory(e.target.value)}
                placeholder="Potholes: 0, Garbage: 0, Water: 0, Streetlights: 0"
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] px-2.5"
              />
            </div>

            <div>
              <label className="block font-bold uppercase text-[#253746]">
                Real Evaluation Metrics (leave blank if untrained)
              </label>
              <input
                type="text"
                value={evaluationMetrics}
                onChange={(e) => setEvaluationMetrics(e.target.value)}
                placeholder="e.g., Acc=0.89, F1=0.88 (only after actual evaluation)"
                className="civic-input mt-1 h-10 w-full rounded border border-[#CBD5E1] px-2.5"
              />
            </div>

            <div>
              <label className="block font-bold uppercase text-[#253746]">Known Limitations *</label>
              <textarea
                rows={2}
                value={limitations}
                onChange={(e) => setLimitations(e.target.value)}
                className="civic-input mt-1 w-full rounded border border-[#CBD5E1] p-2.5"
              />
            </div>

            <button
              type="submit"
              disabled={savingExp}
              className="mt-1 h-11 rounded bg-[#102A43] px-4 text-xs font-semibold text-white hover:bg-[#0B1D2F] cursor-pointer"
            >
              {savingExp ? 'Saving...' : 'Record Experiment Metadata'}
            </button>
          </div>
        </form>

        <div className="rounded-lg border border-[#102A43]/10 bg-white p-5 civic-shadow-1 lg:col-span-7">
          <h2 className="font-display text-base font-semibold text-[#0A1D2B]">
            Recorded Research Experiments ({experiments.length})
          </h2>
          {experiments.length === 0 ? (
            <div className="mt-4 rounded border border-[#E2E8F0] bg-[#F5F7FA] p-6 text-center text-xs text-[#52606D]">
              No research experiments recorded yet. Use the form on the left to document dataset
              preparation, model version, and limitations.
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {experiments.map((exp) => (
                <div key={exp.id} className="rounded border border-[#E2E8F0] p-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#0A1D2B]">{exp.objectiveName}</span>
                    {renderLifecyclePill(exp.lifecycleState)}
                  </div>
                  <div className="mt-1 text-[#43474D]">
                    <strong>Architecture:</strong> {exp.modelArchitecture} ·{' '}
                    <strong>Version:</strong>{' '}
                    <span className="font-mono-tabular">{exp.modelVersion}</span> ·{' '}
                    <strong>Date:</strong> {exp.trainingDate}
                  </div>
                  <div className="mt-1 text-[#43474D]">
                    <strong>Dataset:</strong> {exp.datasetSource} (n={exp.datasetSize}, split{' '}
                    {exp.trainValSplit})
                  </div>
                  {exp.evaluationMetrics && (
                    <div className="mt-1 font-mono-tabular text-[#168B55]">
                      <strong>Metrics:</strong> {exp.evaluationMetrics}
                    </div>
                  )}
                  <div className="mt-1 text-[#52606D]">
                    <strong>Limitations:</strong> {exp.limitations}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
