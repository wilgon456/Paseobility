import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrast, projectTone, modelTone, effortTone, statusTone, requesterTone, tagColors } from '../shared/colors.ts';
test('semantic tags use distinct project hues and meet text contrast in light and dark themes', () => {
  const projects = Array.from({length: 80}, (_, i) => `project-${i}`);
  assert.equal(new Set(projects.map(id => projectTone(id, projects))).size, projects.length);
  const tones = [...projects.map(id => projectTone(id, projects)), ...['terra','sol','claude','go','claude-opus-5-5','opencode-go/deepseek-v4.1-flash'].map(modelTone), ...['auto','low','medium','high'].map(effortTone), ...['waiting','running','attention','success','failed'].map(statusTone), ...['grok','gui','cli'].map(requesterTone)];
  for (const [surface, foreground] of [['#ffffff','#202923'],['#1c211f','#f1f3f2']]) {
    for (const tone of tones) { const c=tagColors(surface,foreground,tone); assert.ok(contrast(c.background,c.foreground) >= 4.5, `${tone} ${surface}`); }
  }
  assert.equal(modelTone('sol'),'green'); assert.equal(modelTone('claude'),'orange'); assert.equal(modelTone('go'),'purple');
  assert.equal(modelTone('claude-opus-5-5'),'orange'); assert.equal(modelTone('opencode-go/deepseek-v4.1-flash'),'purple');
  assert.equal(statusTone('running'),'blue'); assert.equal(statusTone('success'),'green'); assert.equal(statusTone('failed'),'red');
});
