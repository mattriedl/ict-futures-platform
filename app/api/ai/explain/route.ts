export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { getLlmConfig, chatCompletionsUrl } from '@/lib/llm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { patterns, symbol, timeframe, currentPrice, bias, session, killZone } = body ?? {};

    const patternSummary = (patterns ?? [])
      .map((p: any) => `• [${p?.direction}] ${p?.type?.replace?.(/_/g, ' ')}: ${p?.description} (Confidence: ${p?.confidence ?? 0}%)`)
      .join('\n');

    const messages = [
      {
        role: 'system',
        content: `You are an expert ICT (Inner Circle Trader) methodology analyst specializing in futures markets. You have deep knowledge of all ICT concepts including:

MARKET STRUCTURE: Break of Structure (BOS), Market Structure Shift (MSS), Change of Character (CHoCH), Higher Highs/Higher Lows, Lower Highs/Lower Lows.

LIQUIDITY: Buy-side liquidity (BSL) above swing highs and EQH, Sell-side liquidity (SSL) below swing lows and EQL. Liquidity sweeps/raids, stop hunts.

ENTRY MODELS: Order Blocks (OB), Fair Value Gaps (FVG/Imbalance), Optimal Trade Entry (OTE - Fibonacci 62-79% zone), Breaker Blocks (failed OBs), Mitigation Blocks, Silver Bullet setups.

TIMING: Kill Zones (London Open 2-5am ET, NY Open 7-10am ET, London Close 10am-12pm ET, NY PM 1:30-4pm ET), Silver Bullet windows (3-4am ET, 10-11am ET, 2-3pm ET), Asia session.

ADVANCED CONCEPTS: Power of 3 (AMD — Accumulation/Manipulation/Distribution), Premium/Discount array (above 50% fib = premium, below = discount), NWOG/NDOG (opening gaps as price magnets), PDH/PDL/PWH/PWL as key reference levels.

TRADE MANAGEMENT: Always look for at least 1:2 risk-to-reward. Enter in discount for buys, premium for sells. Use displacement candles to identify momentum.

Provide concise, professional analysis. Use ICT terminology. Be specific about price levels. Maximum 350 words.`,
      },
      {
        role: 'user',
        content: `Analyze ICT patterns on ${symbol ?? 'this instrument'} — ${timeframe ?? ''} chart. Current price: ${currentPrice ?? 0}. Overall bias: ${bias ?? 'NEUTRAL'}.${session ? `\nSession: ${session}` : ''}${killZone ? `\nActive Kill Zone: ${killZone}` : ''}

Detected ICT patterns:
${patternSummary || 'No patterns detected yet.'}

Provide:
1. Market context (what is the larger picture telling us?)
2. Key confluences stacking (which ICT concepts align?)
3. Recommended trade setup (direction, entry zone, stop loss, take profit using ICT levels)
4. Risk assessment and timing notes`,
      },
    ];

    const llm = getLlmConfig();
    if (!llm.configured) {
      return new Response(
        JSON.stringify({ error: 'AI analysis is not configured. Set LLM_BASE_URL and LLM_API_KEY.' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const response = await fetch(chatCompletionsUrl(llm.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llm.apiKey}`,
      },
      body: JSON.stringify({
        model: llm.model,
        messages,
        stream: true,
        max_tokens: 1200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      return new Response(JSON.stringify({ error: `AI API error: ${response.status}` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader  = response.body?.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        try {
          while (true) {
            const { done, value } = await (reader?.read() ?? { done: true, value: undefined });
            if (done) break;
            const chunk = decoder.decode(value);
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('Explain error:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate explanation' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
