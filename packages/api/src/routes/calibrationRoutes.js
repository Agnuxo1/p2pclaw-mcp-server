/**
 * P2PCLAW Calibration API Routes
 * ===============================
 * Exposes the comparative calibration engine as REST endpoints.
 * Examiner agents (and the scoring pipeline itself) use these to
 * calibrate scores against recognized reference paper benchmarks.
 */

import { Router } from "express";
import {
    REFERENCE_BENCHMARKS,
    detectField,
    extractSignals,
    calibrateScores,
    generateCalibrationReport,
} from "../services/calibrationService.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

// ── GET /calibration/benchmarks — All reference paper fingerprints ─────────

router.get("/benchmarks", (req, res) => {
    const summary = {};
    for (const [fieldId, data] of Object.entries(REFERENCE_BENCHMARKS)) {
        summary[fieldId] = {
            field: data.field,
            reference_count: data.references.length,
            references: data.references.map(r => ({
                id: r.id,
                title: r.title,
                authors: r.authors,
                year: r.year,
                venue: r.venue,
                doi: r.doi || null,
                expected_scores: Object.fromEntries(
                    Object.entries(r.quality_fingerprint)
                        .filter(([k, v]) => v && typeof v === "object" && v.expected_score)
                        .map(([k, v]) => [k, v.expected_score])
                ),
            })),
        };
    }
    res.json({
        total_fields: Object.keys(summary).length,
        total_references: Object.values(summary).reduce((s, f) => s + f.reference_count, 0),
        fields: summary,
    });
});

// ── GET /calibration/benchmarks/:field — References for specific field ─────

router.get("/benchmarks/:field", (req, res) => {
    const data = REFERENCE_BENCHMARKS[req.params.field];
    if (!data) {
        return res.status(404).json({
            error: `Unknown field: ${req.params.field}`,
            available_fields: Object.keys(REFERENCE_BENCHMARKS),
        });
    }
    res.json({
        field: data.field,
        reference_count: data.references.length,
        references: data.references.map(r => ({
            id: r.id,
            title: r.title,
            authors: r.authors,
            year: r.year,
            venue: r.venue,
            doi: r.doi || null,
            quality_fingerprint: r.quality_fingerprint,
        })),
    });
});

// ── POST /calibration/detect-field — Classify paper into research field ────

router.post("/detect-field", (req, res) => {
    const { content } = req.body || {};
    if (!content) return res.status(400).json({ error: "content required" });

    const result = detectField(content);
    const benchmarks = REFERENCE_BENCHMARKS[result.field];
    res.json({
        ...result,
        field_name: benchmarks ? benchmarks.field : result.field,
        reference_papers: benchmarks ? benchmarks.references.map(r => r.title) : [],
    });
});

// ── POST /calibration/signals — Extract quality signals from paper ─────────

router.post("/signals", (req, res) => {
    const { content } = req.body || {};
    if (!content) return res.status(400).json({ error: "content required" });

    const signals = extractSignals(content);
    const field = detectField(content);
    res.json({
        detected_field: field,
        signals,
    });
});

// ── POST /calibration/evaluate — Full calibration pipeline ─────────────────
// This is the main endpoint. Takes paper content + optional raw LLM scores.
// Returns calibrated scores with full justification report.

router.post("/evaluate", (req, res) => {
    const { content, raw_scores } = req.body || {};
    if (!content) return res.status(400).json({ error: "content required" });

    // If no raw_scores provided, create a neutral baseline (5s across the board)
    const scores = raw_scores || {
        abstract: 5, introduction: 5, methodology: 5, results: 5,
        discussion: 5, conclusion: 5, references: 5,
        novelty: 5, reproducibility: 5, citation_quality: 5,
    };

    const report = generateCalibrationReport(content, scores);
    res.json(report);
});

// ── GET /calibration/board — Serve the calibration board index ─────────────

router.get("/board", (req, res) => {
    try {
        const boardPath = join(__dirname, "..", "silicon", "calibration", "index.md");
        const md = readFileSync(boardPath, "utf-8");
        res.type("text/markdown").send(md);
    } catch (e) {
        res.status(500).json({ error: "Board file not found" });
    }
});

// ── GET /calibration/board/:row/:col — Serve specific grid cell ────────────

router.get("/board/:row/:col", (req, res) => {
    const { row, col } = req.params;
    const r = parseInt(row), c = parseInt(col);
    if (isNaN(r) || isNaN(c) || r < 0 || r > 7 || c < 0 || c > 5) {
        return res.status(400).json({ error: "Invalid cell. Row: 0-7, Col: 0-5" });
    }
    try {
        const cellPath = join(__dirname, "..", "silicon", "calibration", "grid", `cell_R${r}_C${c}.md`);
        const md = readFileSync(cellPath, "utf-8");
        res.type("text/markdown").send(md);
    } catch (e) {
        res.status(404).json({ error: `Cell R${r}C${c} not found` });
    }
});

export default router;
