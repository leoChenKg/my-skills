#!/usr/bin/env node
// Guard the figma-to-code state machine so agents cannot jump from partial facts
// directly into project code generation.
//
// Usage:
//   node .agents/skills/figma-to-code/scripts/flow-guard.mjs --before 3b
//   node .agents/skills/figma-to-code/scripts/flow-guard.mjs --before local-fix
//   node .agents/skills/figma-to-code/scripts/flow-guard.mjs --progress .figma-to-code/PROGRESS.md --before 3b --json

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GATES = [
    'initialized',
    'detected',
    'structure-approved',
    'reuse-done',
    'facts-prefetching',
    'facts-ready',
    'batch-implementing',
    'batch-review',
    'done',
];

const DEFAULT_PROGRESS = '.figma-to-code/PROGRESS.md';
const args = process.argv.slice(2);
let progressPath = DEFAULT_PROGRESS;
let before = null;
let asJson = false;

function usage() {
    return [
        'Usage:',
        '  flow-guard.mjs --before 3b [--progress .figma-to-code/PROGRESS.md] [--json]',
        '  flow-guard.mjs --before local-fix [--progress .figma-to-code/PROGRESS.md] [--json]',
    ].join('\n');
}

for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--progress') {
        progressPath = args[++i];
        if (!progressPath) {
            console.error(`${usage()}\nMissing value for --progress`);
            process.exit(2);
        }
    } else if (arg === '--before') {
        before = args[++i];
        if (!before) {
            console.error(`${usage()}\nMissing value for --before`);
            process.exit(2);
        }
    } else if (arg === '--json') {
        asJson = true;
    } else if (arg === '--help' || arg === '-h') {
        console.log(usage());
        process.exit(0);
    } else {
        console.error(`${usage()}\nUnknown argument: ${arg}`);
        process.exit(2);
    }
}

if (!before) {
    console.error(`${usage()}\nMissing required --before`);
    process.exit(2);
}

function stripComment(value) {
    let quote = null;
    for (let i = 0; i < value.length; i += 1) {
        const ch = value[i];
        if ((ch === '"' || ch === "'") && value[i - 1] !== '\\') {
            quote = quote === ch ? null : quote || ch;
        }
        if (ch === '#' && quote === null) {
            return value.slice(0, i).trim();
        }
    }
    return value.trim();
}

function parseScalar(raw) {
    const value = stripComment(String(raw ?? '').trim());
    if (value === '') return '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    return value;
}

function parseKeyValue(text) {
    const match = text.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!match) return null;
    return [match[1], parseScalar(match[2])];
}

function parseProgress(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
        const json = JSON.parse(trimmed);
        const modules = json.requiredArtifacts?.modules || json.modules || json.units || [];
        return {
            top: {
                currentGate: json.currentGate,
                allowedNextAction: json.allowedNextAction,
                canEditProjectCode: json.canEditProjectCode,
                blockedUntil: json.blockedUntil,
            },
            modules,
        };
    }

    const top = {};
    const modules = [];
    let current = null;

    for (const line of text.split(/\r?\n/)) {
        if (!line.trim() || line.trimStart().startsWith('#')) continue;

        const topKv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
        if (topKv) {
            top[topKv[1]] = parseScalar(topKv[2]);
            current = null;
            continue;
        }

        const listMatch = line.match(/^\s*-\s*(.*)$/);
        if (listMatch) {
            if (current) modules.push(current);
            current = {};
            const kv = parseKeyValue(listMatch[1]);
            if (kv) current[kv[0]] = kv[1];
            continue;
        }

        if (current) {
            const kv = parseKeyValue(line.trim());
            if (kv) current[kv[0]] = kv[1];
        }
    }
    if (current) modules.push(current);

    return { top, modules };
}

function gateIndex(gate) {
    return GATES.indexOf(String(gate || ''));
}

function isTruthy(value) {
    return value === true || value === 'true' || value === 'yes' || value === '1';
}

function isPending(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return ['', 'false', 'missing', 'not-run', 'pending', 'todo', 'none-required?'].includes(normalized);
}

function moduleId(mod) {
    return mod.id || mod.nodeId || mod.nodeIdSafe || mod.name || '<unknown-module>';
}

function artifactPath(value) {
    if (typeof value !== 'string' || value.trim() === '') return null;
    const clean = value.trim();
    if (clean.includes('=') || clean.includes(' ')) return null;
    return clean;
}

function validateModule(mod, index) {
    const errors = [];
    const id = moduleId(mod);
    const referenceTsx = artifactPath(mod.referenceTsx || mod.moduleReferenceTsx || mod.unitReferenceTsx);
    const referencePreview = artifactPath(mod.referencePreview);
    const metadataPath = artifactPath(mod.metadata || mod.metadataPath);
    const hasGeometry = !isPending(mod.geometry);
    const hasAttributeCheck = !isPending(mod.attributeCheck);
    const hasLayoutRisk = mod.layoutRisk !== undefined && String(mod.layoutRisk).trim() !== '';

    if (!referenceTsx) {
        errors.push(`module[${index}] ${id}: missing referenceTsx`);
    } else if (!existsSync(resolve(referenceTsx))) {
        errors.push(`module[${index}] ${id}: referenceTsx not found: ${referenceTsx}`);
    }

    if (!referencePreview) {
        errors.push(`module[${index}] ${id}: missing referencePreview`);
    } else if (!existsSync(resolve(referencePreview))) {
        errors.push(`module[${index}] ${id}: referencePreview not found: ${referencePreview}`);
    }

    if (!metadataPath && !hasGeometry) {
        errors.push(`module[${index}] ${id}: missing metadata or geometry`);
    } else if (metadataPath && !existsSync(resolve(metadataPath))) {
        errors.push(`module[${index}] ${id}: metadata not found: ${metadataPath}`);
    }

    if (!hasAttributeCheck && !hasLayoutRisk) {
        errors.push(`module[${index}] ${id}: missing attributeCheck or layoutRisk`);
    }

    return errors;
}

function validate(progress) {
    const errors = [];
    const warnings = [];
    const currentGate = progress.top.currentGate || progress.top.current_step;
    const currentGateIndex = gateIndex(currentGate);
    const canEditProjectCode = progress.top.canEditProjectCode;
    const modules = progress.modules.filter((mod) => {
        return (
            mod.id ||
            mod.nodeId ||
            mod.nodeIdSafe ||
            mod.referenceTsx ||
            mod.moduleReferenceTsx ||
            mod.unitReferenceTsx ||
            mod.referencePreview
        );
    });

    if (currentGateIndex < 0) {
        errors.push(`currentGate is missing or invalid: ${currentGate || '<empty>'}`);
    }

    if (before === '3b') {
        if (currentGateIndex < gateIndex('facts-ready')) {
            errors.push(`currentGate must be facts-ready or later before 3b; got ${currentGate || '<empty>'}`);
        }
        if (!isTruthy(canEditProjectCode)) {
            errors.push('canEditProjectCode must be true before 3b');
        }
        if (modules.length === 0) {
            errors.push('requiredArtifacts.modules is empty or not registered');
        }
        modules.forEach((mod, index) => {
            errors.push(...validateModule(mod, index));
        });
    } else if (before === 'local-fix' || before === 'project-code') {
        if (currentGateIndex < gateIndex('facts-ready')) {
            errors.push(`local/project code edits require facts-ready or later; got ${currentGate || '<empty>'}`);
        }
        if (!isTruthy(canEditProjectCode)) {
            errors.push('canEditProjectCode must be true before local/project code edits');
        }
        if (modules.length === 0) {
            warnings.push('no module artifacts registered; local fix may not be tied to a reviewed batch');
        }
    } else if (before === '3a') {
        if (currentGateIndex < gateIndex('facts-ready')) {
            errors.push(`3a requires facts-ready; got ${currentGate || '<empty>'}`);
        }
    } else {
        errors.push(`unsupported --before value: ${before}`);
    }

    return {
        ok: errors.length === 0,
        before,
        currentGate,
        canEditProjectCode,
        allowedNextAction: progress.top.allowedNextAction,
        moduleCount: modules.length,
        errors,
        warnings,
    };
}

if (!existsSync(progressPath)) {
    const result = {
        ok: false,
        before,
        progressPath,
        errors: [`PROGRESS.md not found: ${progressPath}`],
        warnings: [],
    };
    if (asJson) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.error(`✗ flow guard failed\n- ${result.errors.join('\n- ')}`);
    }
    process.exit(1);
}

let progress;
try {
    progress = parseProgress(readFileSync(progressPath, 'utf8'));
} catch (error) {
    const result = {
        ok: false,
        before,
        progressPath,
        errors: [`failed to parse progress: ${error.message}`],
        warnings: [],
    };
    if (asJson) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.error(`✗ flow guard failed\n- ${result.errors.join('\n- ')}`);
    }
    process.exit(1);
}

const result = { progressPath, ...validate(progress) };

if (asJson) {
    console.log(JSON.stringify(result, null, 2));
} else if (result.ok) {
    console.log(`✓ flow guard passed before ${before}`);
    console.log(`  currentGate: ${result.currentGate}`);
    console.log(`  canEditProjectCode: ${result.canEditProjectCode}`);
    console.log(`  moduleCount: ${result.moduleCount}`);
    if (result.warnings.length) {
        console.log(`  warnings: ${result.warnings.join('; ')}`);
    }
} else {
    console.error(`✗ flow guard failed before ${before}`);
    for (const error of result.errors) {
        console.error(`- ${error}`);
    }
    if (result.warnings.length) {
        for (const warning of result.warnings) {
            console.error(`warning: ${warning}`);
        }
    }
}

process.exit(result.ok ? 0 : 1);
