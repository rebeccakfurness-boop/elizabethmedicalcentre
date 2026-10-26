import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { ANALYTES_BY_CODE } from '@/clinical/labs';
import type { ExtractedResult } from '@/lib/labs';

const CODES = [...ANALYTES_BY_CODE.keys()];

const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          analyteCode: { type: 'string', enum: [...CODES, 'other'] },
          name: { type: 'string' },
          value: { type: 'string' },
          unit: { type: 'string' },
          refRange: { type: 'string' },
        },
        required: ['analyteCode', 'name', 'value', 'unit', 'refRange'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
};

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const labReaderAvailable = () => !!process.env.ANTHROPIC_API_KEY;

/**
 * Transcribes the results table of a lab report. Literal transcription only: the clinician checks
 * every value against the report before it is saved, and flags are worked out by the app.
 */
export async function readLabReport(buffer: Buffer, contentType: string): Promise<ExtractedResult[]> {
  if (!labReaderAvailable()) throw new Error('Reading reports automatically needs ANTHROPIC_API_KEY. Type the results in instead.');
  let source: Anthropic.Beta.BetaContentBlockParam;
  if (contentType === 'application/pdf') {
    source = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } };
  } else if (IMAGE_TYPES.has(contentType)) {
    source = { type: 'image', source: { type: 'base64', media_type: contentType as 'image/jpeg' | 'image/png' | 'image/webp', data: buffer.toString('base64') } };
  } else {
    throw new Error('Only PDF, JPEG, PNG or WebP reports can be read automatically.');
  }
  const catalogue = CODES.map((c) => `${c}: ${ANALYTES_BY_CODE.get(c)!.name}${ANALYTES_BY_CODE.get(c)!.unit ? ` (${ANALYTES_BY_CODE.get(c)!.unit})` : ''}`).join('\n');
  const client = new Anthropic();
  try {
    const message = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system:
        'You transcribe medical laboratory reports into structured data for a clinician to check. ' +
        'Copy every result exactly as printed: value, unit and the reference range the lab printed (empty string if none). ' +
        'Do not interpret, convert units, correct, round or add results that are not on the report. ' +
        'Map each result to the closest analyte code from the list when it is clearly the same test; otherwise use "other".\n\nAnalyte codes:\n' +
        catalogue,
      messages: [{ role: 'user', content: [source, { type: 'text', text: 'Transcribe every result on this lab report.' }] }],
    });
    if (message.stop_reason === 'refusal') throw new Error('The report could not be read automatically. Type the results in instead.');
    const text = message.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text;
    if (!text) throw new Error('No results came back from the report reader.');
    const parsed = JSON.parse(text) as { results: { analyteCode: string; name: string; value: string; unit: string; refRange: string }[] };
    return parsed.results
      .filter((r) => r.value.trim())
      .map((r) => ({
        analyteCode: r.analyteCode !== 'other' && ANALYTES_BY_CODE.has(r.analyteCode) ? r.analyteCode : null,
        name: r.name.trim(),
        value: r.value.trim(),
        unit: r.unit.trim() || null,
        refRange: r.refRange.trim() || null,
      }));
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('ANTHROPIC_API_KEY is invalid.');
    if (err instanceof Anthropic.RateLimitError) throw new Error('The report reader is busy. Try again in a minute.');
    if (err instanceof Anthropic.APIError) throw new Error(`Report reader error (${err.status}): ${err.message}`);
    throw err;
  }
}
