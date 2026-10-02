import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeExposure } from '../src/exposure.js';

const fixture = JSON.parse(await readFile(new URL('../data/demo.json', import.meta.url), 'utf8')).exposure;
const moments = [
  '2026-09-21T09:30:00Z',
  '2026-09-21T10:05:00Z',
  '2026-09-21T11:05:00Z',
  fixture.asOf,
];
const timeline = moments.map((asOf) => {
  const report = analyzeExposure({ ...fixture, asOf });
  return {
    asOf,
    knownIncidentIds: report.alerts.map(({ incident }) => incident.id),
    ignored: report.ignored,
    potentialExposureUpperBoundUsd: report.potentialExposureUpperBoundUsd,
    coverageGapCount: report.gaps.length,
  };
});
assert.ok(!timeline[0].knownIncidentIds.includes('i1'));
assert.ok(timeline[1].knownIncidentIds.includes('i1'));
assert.ok(!timeline[1].knownIncidentIds.includes('i2'));
assert.ok(timeline[2].knownIncidentIds.includes('i2'));
console.log(JSON.stringify({ synthetic: true, timeline }, null, 2));
