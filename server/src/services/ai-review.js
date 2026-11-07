/**
 * AI 初审：调用 OpenAI 兼容的 chat/completions 接口做机器初审。
 *
 * - 接口：POST {base_url}/chat/completions，Authorization: Bearer {api_key}
 * - 请求体：{ model, temperature, stream:false, messages:[system,user] }，
 *   cfg.thinking !== 'off' 时附加 reasoning_effort
 * - 审核标准按 cfg.strictness 分档（loose / standard / strict / custom）
 * - 只接受模型返回的 JSON 判定结果；解析失败一律抛错（由流程引擎记 ai_error）
 */

/** 正文最多送入 30000 字符（避免超长上下文拖垮接口） */
const MAX_CONTENT = 30000;

/** 各档审核标准（custom 档直接用配置里的自定义提示词） */
const CRITERIA = {
  loose:
    '仅拒绝明显违规的内容：违法犯罪、色情低俗、暴力血腥、仇恨歧视、欺诈、泄露隐私、恶意广告。除此以外的普通内容一律通过。',
  standard:
    '在明显违规（违法犯罪、色情低俗、暴力血腥、仇恨歧视、欺诈、泄露隐私、恶意广告）之外，同时拒绝以下内容：灌水水文、无意义内容、虚假信息、诱导行为、垃圾外链。',
  strict:
    '在标准档基础上进一步从严把关，同时拒绝以下内容：情绪极端、争议敏感、内容质量低下。宁可误伤少量正常内容，也不要放过问题内容。',
};

/** 统一的输出格式要求 */
const OUTPUT_REQUIREMENT =
  '只输出一个 JSON 对象，不要输出任何其他文字、解释或 Markdown 代码围栏。格式：{"verdict":"approve"|"reject","reason":"简短中文理由","confidence":0到1之间的小数}。';

/** 生成 system 提示词：审核标准 + 统一输出格式 */
export function buildSystemPrompt(cfg) {
  const strictness = String(cfg?.strictness ?? 'standard').toLowerCase();
  let criteria;
  if (strictness === 'custom') {
    criteria = String(cfg?.custom_prompt ?? '').trim() || CRITERIA.standard;
  } else {
    criteria = CRITERIA[strictness] || CRITERIA.standard;
  }
  return `你是一名严格但公正的内容审核员，请审核用户提交的博客文章。\n\n审核标准：\n${criteria}\n\n${OUTPUT_REQUIREMENT}`;
}

/** 生成 user 提示词：标题 / 摘要 / 正文（正文超长截断） */
export function buildUserPrompt({ title, summary, content }) {
  const raw = String(content ?? '');
  const body = raw.slice(0, MAX_CONTENT);
  const tail = raw.length > MAX_CONTENT ? '\n（正文过长，已截断）' : '';
  return `请审核以下文章。\n\n标题：${String(title ?? '')}\n摘要：${String(summary ?? '')}\n正文：\n${body}${tail}`;
}

/**
 * 从模型输出里稳健地提取第一个 JSON 对象：
 * 容忍 ```json 围栏、前后多余文字、字符串里的花括号。
 * 提取或解析失败返回 null。
 */
export function extractJsonObject(text) {
  let s = String(text ?? '').trim();
  if (!s) return null;
  const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  try {
    const obj = JSON.parse(s.slice(start, end + 1));
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

/**
 * 执行一次 AI 审核。
 * @param {object} cfg 后台配置的 AI 参数（base_url / api_key / model / temperature / timeout_seconds / strictness / custom_prompt / thinking）
 * @param {{title?:string,summary?:string,content?:string}} article 文章快照
 * @returns {Promise<{verdict:'approve'|'reject',reason:string,confidence:number,model:string,raw:object}>}
 * @throws {Error} 网络失败 / 超时 / 非 2xx / 响应无法解析
 */
export async function runAIReview(cfg, { title, summary, content }) {
  const base = String(cfg?.base_url ?? '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('AI 接口地址未配置');
  const url = `${base}/chat/completions`;
  const model = String(cfg?.model ?? '').trim();
  if (!model) throw new Error('AI 模型未配置');
  const temperature = Number.isFinite(Number(cfg?.temperature)) ? Number(cfg.temperature) : 0.2;
  const seconds = Number.isFinite(Number(cfg?.timeout_seconds)) ? Number(cfg.timeout_seconds) : 60;
  const timeoutMs = Math.max(1, seconds) * 1000;

  const body = {
    model,
    temperature,
    stream: false,
    messages: [
      { role: 'system', content: buildSystemPrompt(cfg) },
      { role: 'user', content: buildUserPrompt({ title, summary, content }) },
    ],
  };
  const thinking = String(cfg?.thinking ?? 'off');
  if (thinking !== 'off') body.reasoning_effort = thinking;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg?.api_key ?? ''}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const msg = String(e?.message || e);
    if (e?.name === 'TimeoutError' || /timeout|aborted|timed out/i.test(msg)) {
      throw new Error(`AI 审核请求超时（${Math.round(timeoutMs / 1000)} 秒）`);
    }
    throw new Error(`AI 审核请求失败：${msg}`);
  }

  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`AI 接口返回状态码 ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('AI 响应无法解析');
  }

  const contentText = data?.choices?.[0]?.message?.content;
  if (typeof contentText !== 'string' || !contentText.trim()) throw new Error('AI 响应无法解析');
  const obj = extractJsonObject(contentText);
  if (!obj) throw new Error('AI 响应无法解析');

  const verdict = String(obj.verdict ?? '').trim().toLowerCase();
  if (verdict !== 'approve' && verdict !== 'reject') throw new Error('AI 响应无法解析');

  const rawConfidence = Number(obj.confidence);
  const confidence = Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : 0.5;

  return {
    verdict,
    reason: String(obj.reason ?? '').trim().slice(0, 500),
    confidence,
    model,
    raw: data,
  };
}
