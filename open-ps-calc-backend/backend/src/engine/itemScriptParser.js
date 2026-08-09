/**
 * itemScriptParser.js — JS port of core/item_script_parser.py
 *
 * Parses Hercules-style item scripts: bonus/bonus2/bonus3/bonus4 calls,
 * sc_start/sc_start2/sc_start4 calls, and `skill X,N` grants. Runtime-context
 * dependent tokens (getrefine(), getskilllv(), readparam(), if/else blocks)
 * are pre-processed before the bonus regex runs.
 *
 * Python's `ast` module has no JS equivalent, so `safeEvalInt` below is a
 * small hand-written tokenizer + recursive-descent parser supporting the same
 * grammar subset as the original: + - * / // % comparisons, and/or, unary
 * +/-/not. This is the one piece of real "new code" in this port; everything
 * else is a direct structural translation.
 */
const { BONUS1, BONUS2, BONUS3, BONUS4, ELE_STR_TO_INT, resolveBonusType } = require("./bonusDefinitions");
const { createItemEffect, createSCEffect } = require("./models");

// ---------------------------------------------------------------------
// ItemScriptContext factory
// ---------------------------------------------------------------------
function createItemScriptContext(overrides = {}) {
  return {
    refine: 0,
    skill_levels: {},
    base_level: null,
    job_level: null,
    str_: null, agi: null, vit: null, int_: null, dex: null, luk: null,
    hp: null, sp: null, max_hp: null, max_sp: null,
    class_: null, base_job: null,
    weapon_level: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// Safe expression evaluator (mini tokenizer + recursive descent)
// ---------------------------------------------------------------------
class EvalError extends Error {}

function tokenize(expr) {
  const tokens = [];
  const re = /\s*(==|!=|<=|>=|\/\/|[()+\-*/%<>]|\d+\.\d+|\d+|[A-Za-z_]\w*)/g;
  let m;
  let lastIndex = 0;
  while ((m = re.exec(expr)) !== null) {
    if (m.index !== lastIndex) {
      const gap = expr.slice(lastIndex, m.index);
      if (gap.trim() !== "") throw new EvalError(`unexpected token near '${gap}'`);
    }
    tokens.push(m[1]);
    lastIndex = re.lastIndex;
  }
  if (lastIndex !== expr.length && expr.slice(lastIndex).trim() !== "") {
    throw new EvalError("trailing garbage in expression");
  }
  return tokens;
}

function parseAndEval(tokens, context) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function orExpr() {
    let v = andExpr();
    while (peek() === "or") {
      next();
      const r = andExpr();
      v = v || r ? 1 : 0;
    }
    return v;
  }
  function andExpr() {
    let v = notExpr();
    while (peek() === "and") {
      next();
      const r = notExpr();
      v = v && r ? 1 : 0;
    }
    return v;
  }
  function notExpr() {
    if (peek() === "not") {
      next();
      return notExpr() ? 0 : 1;
    }
    return compare();
  }
  function compare() {
    let left = add();
    const ops = ["==", "!=", "<=", ">=", "<", ">"];
    let compared = false;
    while (ops.includes(peek())) {
      compared = true;
      const op = next();
      const right = add();
      let ok;
      if (op === "==") ok = left === right;
      else if (op === "!=") ok = left !== right;
      else if (op === "<") ok = left < right;
      else if (op === "<=") ok = left <= right;
      else if (op === ">") ok = left > right;
      else ok = left >= right;
      if (!ok) return 0;
      left = right;
    }
    // With no comparison operator this is just an arithmetic expression — yield its
    // VALUE, not a boolean 1. Hercules scripts embed comparisons inside arithmetic
    // (Rekenber Mercenary / Pirate Skel: `1+9*(getskilllv(X)==10)` = the cast level),
    // and returning 1 there silently collapsed every such value to 1.
    return compared ? 1 : left;
  }
  function add() {
    let v = mul();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const r = mul();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function mul() {
    let v = unary();
    while (peek() === "*" || peek() === "//" || peek() === "/" || peek() === "%") {
      const op = next();
      const r = unary();
      if (op === "*") v = v * r;
      else if (op === "//" || op === "/") v = r === 0 ? 0 : Math.floor(v / r);
      else v = r === 0 ? 0 : v % r;
    }
    return v;
  }
  function unary() {
    if (peek() === "+") { next(); return unary(); }
    if (peek() === "-") { next(); return -unary(); }
    return primary();
  }
  function primary() {
    const tok = next();
    if (tok === undefined) throw new EvalError("unexpected end of expression");
    if (tok === "(") {
      const v = orExpr();
      if (next() !== ")") throw new EvalError("expected )");
      return v;
    }
    if (/^\d+\.\d+$/.test(tok)) return Math.trunc(parseFloat(tok));
    if (/^\d+$/.test(tok)) return parseInt(tok, 10);
    if (tok in context) return context[tok];
    throw new EvalError(`Unknown variable: ${tok}`);
  }

  const result = orExpr();
  if (pos !== tokens.length) throw new EvalError("trailing tokens");
  return result;
}

function safeEvalInt(expr, context) {
  const normalized = expr.replace(/&&/g, " and ").replace(/\|\|/g, " or ");
  try {
    const tokens = tokenize(normalized);
    return parseAndEval(tokens, context);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Conditional block stripper
// ---------------------------------------------------------------------
function extractBlock(script, i) {
  if (i < script.length && script[i] === "{") {
    i += 1;
    let depth = 1;
    const start = i;
    while (i < script.length && depth > 0) {
      const c = script[i];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      i += 1;
    }
    return [script.slice(start, i - 1), i];
  }
  const start = i;
  while (i < script.length && script[i] !== ";") i += 1;
  if (i < script.length) i += 1;
  return [script.slice(start, i), i];
}

function isWordChar(c) {
  return c !== undefined && /[A-Za-z0-9_]/.test(c);
}

function evalConditionals(script, context) {
  const result = [];
  let i = 0;
  const n = script.length;

  while (i < n) {
    if (
      script.slice(i, i + 2) === "if" &&
      (i === 0 || !isWordChar(script[i - 1])) &&
      (i + 2 >= n || !isWordChar(script[i + 2]))
    ) {
      let j = i + 2;
      while (j < n && " \t\n\r".includes(script[j])) j += 1;

      if (j < n && script[j] === "(") {
        let depth = 1;
        j += 1;
        const condStart = j;
        while (j < n && depth > 0) {
          if (script[j] === "(") depth += 1;
          else if (script[j] === ")") depth -= 1;
          j += 1;
        }
        const condition = script.slice(condStart, j - 1);

        while (j < n && " \t\n\r".includes(script[j])) j += 1;

        const [trueBranch, j2] = extractBlock(script, j);
        j = j2;

        let k = j;
        while (k < n && " \t\n\r".includes(script[k])) k += 1;
        let falseBranch = "";
        if (
          script.slice(k, k + 4) === "else" &&
          (k + 4 >= n || !isWordChar(script[k + 4]))
        ) {
          k += 4;
          while (k < n && " \t\n\r".includes(script[k])) k += 1;
          const [fb, k2] = extractBlock(script, k);
          falseBranch = fb;
          k = k2;
          j = k;
        }

        const condVal = safeEvalInt(condition.trim(), context);
        let chosen;
        if (condVal === null) chosen = trueBranch;
        else if (condVal) chosen = trueBranch;
        else chosen = falseBranch;

        result.push(evalConditionals(chosen, context));
        i = j;
        continue;
      }
    }
    result.push(script[i]);
    i += 1;
  }

  return result.join("");
}

// ---------------------------------------------------------------------
// Public preprocessor
// ---------------------------------------------------------------------
const READPARAM_MAP = { bStr: "str_", bAgi: "agi", bVit: "vit", bInt: "int_", bDex: "dex", bLuk: "luk" };

function preprocessScript(script, ctx = null) {
  if (ctx == null) ctx = createItemScriptContext();

  // `autobonus`/`autobonus2`/`autobonus3` are deferred PROC effects: their inner
  // `bonus ...` statements only apply when the proc fires. Strip the whole
  // statement (including its quoted inner script) so BONUS_RE / SC_START_RE don't
  // harvest the inner effects as always-on base bonuses. Without this, e.g.
  // Bonechewer Card (`autobonus "{ bonus bCritical,5; bonus bCritAtkRate,50; }",…`)
  // applied its crit bonus once just from being equipped, and again via the
  // "always proc" toggle. gearBonusAggregator handles autobonus separately on the
  // raw script and re-parses only the inner `{…}` content (which has no `autobonus`
  // keyword), so this strip does not affect the proc/force-proc path.
  if (script.includes("autobonus")) {
    script = script.replace(/\bautobonus[23]?\s*"(?:[^"\\]|\\.)*"[^;]*;/g, " ");
  }

  const hasGetrefine = script.includes("getrefine");
  const hasGetskilllv = script.includes("getskilllv");
  const hasReadparam = script.includes("readparam");
  const hasGetweaponlv = script.includes("getequipweaponlv");
  const hasIf = script.includes("if(") || script.includes("if (");

  if (!(hasGetrefine || hasGetskilllv || hasReadparam || hasGetweaponlv || hasIf)) return script;

  if (hasGetrefine) {
    script = script.replace(/\bgetrefine\s*\(\s*\)/g, String(ctx.refine));
  }

  if (hasGetskilllv && Object.keys(ctx.skill_levels).length) {
    script = script.replace(/\bgetskilllv\s*\(\s*(\w+)\s*\)/g, (_m, name) => String(ctx.skill_levels[name] ?? 0));
  }

  if (hasReadparam) {
    const statValues = {};
    for (const [paramKey, fieldName] of Object.entries(READPARAM_MAP)) {
      const val = ctx[fieldName];
      if (val !== null && val !== undefined) statValues[paramKey] = val;
    }
    if (Object.keys(statValues).length) {
      const names = Object.keys(READPARAM_MAP).join("|");
      const re = new RegExp(`\\breadparam\\s*\\(\\s*(${names})\\s*\\)`, "g");
      script = script.replace(re, (full, p1) => (p1 in statValues ? String(statValues[p1]) : full));
    }
  }

  if (hasGetweaponlv) {
    if (ctx.weapon_level == null) {
      throw new Error(
        "getequipweaponlv() in item script but ctx.weapon_level is None — weapon_level must be set when parsing weapon card scripts"
      );
    }
    script = script.replace(/\bgetequipweaponlv\s*\(\s*\w*\s*\)/g, String(ctx.weapon_level));
  }

  const varContext = {};
  const varFields = [
    ["BaseLevel", ctx.base_level],
    ["JobLevel", ctx.job_level],
    ["Hp", ctx.hp],
    ["MaxHp", ctx.max_hp],
    ["Sp", ctx.sp],
    ["MaxSp", ctx.max_sp],
    ["Class", ctx.class_],
    ["BaseJob", ctx.base_job],
  ];
  for (const [name, val] of varFields) {
    if (val !== null && val !== undefined) varContext[name] = val;
  }

  script = evalConditionals(script, varContext);

  return script;
}

// ---------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------
const BONUS_RE = /\bbonus(2|3|4)?\s+(b\w+)(?:[,\s](.+?))?(?=;|$)/gm;
const SKILL_RE = /\bskill\s+(\w+)\s*,\s*(\d+)/gm;

// Evaluate a pure-arithmetic expression (integers with + - * / and parens) with
// normal precedence. Returns null if the string isn't pure arithmetic. Item
// scripts are trusted data, and after getrefine()/readparam() substitution a
// bonus value is often an expression like "10*5" or "3+2" that plain parseInt
// (and the boolean-only safeEvalInt) can't handle.
function evalArithmetic(s) {
  if (!/^[\d\s+\-*/().]+$/.test(s)) return null;
  const toks = s.match(/\d+|[+\-*/()]/g);
  if (!toks || !toks.length) return null;
  let i = 0;
  const peek = () => toks[i];
  const next = () => toks[i++];
  function factor() {
    const t = next();
    if (t === "(") { const v = expr(); if (next() !== ")") throw new Error("paren"); return v; }
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    throw new Error("factor");
  }
  function term() {
    let v = factor();
    while (peek() === "*" || peek() === "/") {
      const op = next(); const r = factor();
      v = op === "*" ? v * r : (r === 0 ? 0 : Math.trunc(v / r));
    }
    return v;
  }
  function expr() {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = next(); const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  try {
    const v = expr();
    if (i !== toks.length) return null;
    return Math.trunc(v);
  } catch {
    return null;
  }
}

function coerce(s) {
  s = s.trim();
  // Hercules item scripts commonly quote string params (skill/status
  // constants, etc.) -- strip a single matching pair so e.g. "WZ_VERMILION"
  // resolves the same as an unquoted WZ_VERMILION instead of becoming a
  // literal key with quote characters baked in.
  if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
    s = s.slice(1, -1).trim();
  }
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  const arith = evalArithmetic(s);
  if (arith !== null) return arith;
  const val = safeEvalInt(s, {});
  if (val !== null) return val;
  return s;
}

function makeDescription(bonusType, arity, params) {
  const table = { 1: BONUS1, 2: BONUS2, 3: BONUS3, 4: BONUS4 }[arity] || {};
  const defn = table[bonusType];
  if (defn == null || params.length < arity) return `[${bonusType} effect]`;
  try {
    return defn.description(...params.slice(0, arity));
  } catch {
    return `[${bonusType} effect]`;
  }
}

function parseScript(script, ctx = null) {
  if (!script) return [];
  script = preprocessScript(script, ctx);
  const effects = [];

  for (const m of script.matchAll(BONUS_RE)) {
    const aritySuffix = m[1];
    const arity = aritySuffix ? parseInt(aritySuffix, 10) : 1;
    const bonusType = resolveBonusType(arity, m[2]);
    const rawParams = m[3] || "";
    const parts = rawParams.split(",").map((p) => p.trim()).filter((p) => p.length);
    const params = parts.map(coerce);
    const description = makeDescription(bonusType, arity, params);
    effects.push(createItemEffect({ bonus_type: bonusType, arity, params, description }));
  }

  for (const m of script.matchAll(SKILL_RE)) {
    const skillName = m[1];
    const level = parseInt(m[2], 10);
    effects.push(createItemEffect({
      bonus_type: "skill", arity: 2, params: [skillName, level],
      description: `Grants ${skillName} level ${level}`,
    }));
  }

  return effects;
}

// ---------------------------------------------------------------------
// sc_start parser
// ---------------------------------------------------------------------
const SC_START_RE = /\bsc_start(2|4)?\s*\(?\s*(SC_\w+)((?:\s*,\s*-?[\w.]+)*)/gm;

function parseScStart(script, ctx = null) {
  if (!script) return [];
  script = preprocessScript(script, ctx);
  const effects = [];

  for (const m of script.matchAll(SC_START_RE)) {
    const scName = m[2];
    const rawTokens = m[3] || "";
    const numeric = [];
    for (const tokRaw of rawTokens.split(",")) {
      const tok = tokRaw.trim();
      if (!tok) continue;
      if (/^-?\d+$/.test(tok)) numeric.push(parseInt(tok, 10));
    }
    if (!numeric.length) continue;
    const durationMs = numeric[0];
    const vals = numeric.slice(1);
    effects.push(createSCEffect({
      sc_name: scName,
      duration_ms: durationMs,
      val1: vals[0] ?? 0,
      val2: vals[1] ?? 0,
      val3: vals[2] ?? 0,
      val4: vals[3] ?? 0,
    }));
  }

  return effects;
}

module.exports = {
  createItemScriptContext,
  preprocessScript,
  parseScript,
  parseScStart,
  makeDescription,
  safeEvalInt,
};
