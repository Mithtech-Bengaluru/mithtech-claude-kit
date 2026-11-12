#!/usr/bin/env node
// PreToolUse routing guard for start_session and Agent (Task).
// Blocks a call with no model/effort, a call below a named floor, a Route: line that does not match,
// and a fork without "Route: inherit | Reason: ...". The block message prints the route to use.
// Exit 2 + stderr blocks the call in every permission mode. Any internal error fails open (exit 0).
// The prompt or brief names its route and floor with lines:  Route: <route-id | model/effort | inherit>
//                                                           Floor: money|permissions|production|contracts
//                                                           Program: <slug>
import path from 'node:path';
import { KIT, readStdin, readText } from '../lib/common.mjs';
import { loadRouting, resolve, matches, toAlias, belowFloors, floorIds, pickRoute, agentRoute, logRoute } from '../lib/route.mjs';

const line = (text, key) => (text.match(new RegExp(`^[\\s>*-]*${key}:[ \\t]*([^\\n|]+)`, 'im')) || [])[1]?.trim();

function run() {
  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return 0; }
  const tool = input.tool_name || '', ti = input.tool_input || {};
  const kind = /start_session$/.test(tool) ? 'session' : /^(Agent|Task)$/.test(tool) ? 'agent' : null;
  if (!kind) return 0;
  const routing = loadRouting();
  if (!routing?.routes) return 0;
  const cwd = input.cwd || process.cwd();

  // text that names the route: the prompt, then the brief the prompt names
  let text = [ti.prompt, ti.background].filter(Boolean).join('\n');
  const bp = text.match(/docs\/programs\/([\w.-]+)\/briefs\/([\w.-]+)\.md/);
  let program = line(text, 'Program')?.match(/^[\w-]+/)?.[0];
  if (bp) { program = program || bp[1]; text += '\n' + readText(path.resolve(cwd, bp[0])).slice(0, 20000); }
  const routeVal = line(text, 'Route')?.match(/^[a-z][\w./-]*/i)?.[0];
  const floors = (line(text, 'Floor') || '').split(/[,\s]+/).filter((f) => floorIds(routing).includes(f));
  const inherit = routeVal === 'inherit';
  let expected = null, routeErr = null;
  if (routeVal && !inherit) { try { expected = resolve(routeVal, { floors, routing }); } catch (e) { routeErr = e.message; } }

  const label = `${kind}:${String(ti.title || ti.description || ti.name || ti.subagent_type || '-').slice(0, 60)}`;
  const log = (verdict, model, effort, why) => logRoute({ cwd, program, label, model: model || '-', effort: effort || '-', reason: `${verdict}: ${why}` });
  const suggestion = () => {
    if (expected) return expected;
    const pick = routeVal && !inherit && !routeErr ? routeVal : `describe:${ti.title || ''} ${(ti.prompt || ti.description || '').slice(0, 300)}`;
    return resolve(pick, { floors, routing });
  };
  const block = (why, model, effort, extra = '') => {
    const s = suggestion();
    log('BLOCK', model, effort, why);
    process.stderr.write(`mithtech routing: BLOCKED ${tool}: ${why}\n`
      + `Use route ${s.routeId ? `"${s.routeId}"` : '(explicit)'}: model ${s.model}, effort ${s.effort}.\n`
      + `(${s.reason})\n${extra}`
      + `Add the line "Route: ${s.routeId || s.model + '/' + s.effort}" to the prompt. Check: node ${path.join(KIT, 'scripts', 'route.mjs')} ${s.routeId || s.model + '/' + s.effort}\n`);
    return 2;
  };
  if (routeErr) return block(routeErr, ti.model, ti.effort);

  if (kind === 'session') {
    // not a new run: an offer card (title only), a started proposal, or a cloud run (model does not apply)
    if (ti.proposal_id || !ti.prompt || ti.target === 'cloud') return 0;
    if (ti.context === 'fork') {
      if (inherit && /Reason:\s*\S/i.test(text)) { log('ALLOW', 'inherit', 'inherit', 'fork inherits parent model and effort (Route: inherit)'); return 0; }
      return block('a fork copies the parent model and effort; this call cannot set them', 'inherit', 'inherit',
        'Use context "fresh" with model and effort, or add "Route: inherit | Reason: <why>" to accept the parent setting.\n');
    }
    if (inherit && /Reason:\s*\S/i.test(text) && !ti.model && !ti.effort) { log('ALLOW', 'inherit', 'inherit', 'Route: inherit'); return 0; }
    if (!ti.model || !ti.effort) return block(`no ${!ti.model && !ti.effort ? 'model and no effort' : !ti.model ? 'model' : 'effort'} on the call`, ti.model, ti.effort, 'Pass both `model` and `effort`.\n');
    const alias = toAlias(routing, ti.model);
    if (!alias) return block(`unknown model "${ti.model}"`, ti.model, ti.effort);
    if (!routing.effortLevels.includes(ti.effort)) return block(`unknown effort "${ti.effort}"`, ti.model, ti.effort);
    const low = belowFloors(routing, { alias, effort: ti.effort }, floors);
    if (low.length) return block(`${alias}/${ti.effort} is below the ${low.join(', ')} floor`, ti.model, ti.effort);
    if (expected && !matches(routing, expected, ti.model, ti.effort)) return block(`call ${alias}/${ti.effort} does not match route "${routeVal}" (${expected.alias}/${expected.effort})`, ti.model, ti.effort);
    log('ALLOW', ti.model, ti.effort, expected ? `matches route "${routeVal}"` : 'valid model and effort');
    return 0;
  }

  // Agent / Task. This tool cannot set effort: kit agents carry it in their frontmatter.
  const st = String(ti.subagent_type || '');
  if (st === 'fork') {
    if (inherit && /Reason:\s*\S/i.test(text)) { log('ALLOW', 'inherit', 'inherit', 'fork inherits parent model and effort (Route: inherit)'); return 0; }
    return block('a fork copies the parent model and effort; the Agent tool cannot set them', 'inherit', 'inherit',
      'Use a kit agent (mithtech:worker, mithtech:checker, ...), or start_session with model and effort, or add "Route: inherit | Reason: <why>".\n');
  }
  const kit = agentRoute(routing, st.replace(/^mithtech:/, ''));
  if (kit && (st.startsWith('mithtech:') || !st.includes(':'))) {
    const model = ti.model || kit.model;
    const alias = toAlias(routing, model);
    if (!alias) return block(`unknown model "${model}"`, model, kit.effort);
    const low = belowFloors(routing, { alias, effort: kit.effort }, floors);
    if (low.length) return block(`kit agent ${st} runs ${alias}/${kit.effort}, below the ${low.join(', ')} floor`, model, kit.effort, 'The Agent tool cannot raise effort. Use start_session with model and effort.\n');
    if (expected && !matches(routing, expected, model, kit.effort)) return block(`kit agent ${st} runs ${alias}/${kit.effort}; route "${routeVal}" needs ${expected.alias}/${expected.effort}`, model, kit.effort, 'The Agent tool cannot raise effort. Use start_session with model and effort.\n');
    log('ALLOW', model, kit.effort, `kit agent ${st} (route "${kit.id}")`);
    return 0;
  }
  if (!ti.model) return block(`no model on a ${st || 'general-purpose'} subagent (it would copy the parent)`, ti.model, null, 'Pass `model`, or use a kit agent that carries its own model and effort.\n');
  const alias = toAlias(routing, ti.model);
  if (!alias) return block(`unknown model "${ti.model}"`, ti.model, null);
  if (floors.length) return block(`floor ${floors.join(', ')} named, but the Agent tool cannot set effort for ${st || 'general-purpose'}`, ti.model, null, 'Use start_session with model and effort.\n');
  if (expected && matches(routing, { ...expected, effort: '*' }, ti.model, '*') === false) return block(`model ${alias} does not match route "${routeVal}" (${expected.alias})`, ti.model, null);
  log('ALLOW', ti.model, 'inherited', `model set; effort inherited from the parent (${st || 'general-purpose'})`);
  return 0;
}

let code = 0;
try { code = run(); } catch (e) { process.stderr.write(`mithtech route-guard error (fail open): ${e.message}\n`); code = 0; }
process.exit(code);
