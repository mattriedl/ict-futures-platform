'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  createSeriesMarkers,
  LineStyle,
} from 'lightweight-charts';

interface Bar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Pattern {
  type: string;
  direction: string;
  priceLevel: number;
  upperBound?: number;
  lowerBound?: number;
  confidence: number;
  description: string;
}

interface CandlestickChartProps {
  bars: Bar[];
  patterns: Pattern[];
  loading: boolean;
}

const ZONE_COLORS: Record<string, { bullish: string; bearish: string }> = {
  ORDER_BLOCK: { bullish: '#10B98130', bearish: '#EF444430' },
  FVG: { bullish: '#3B82F625', bearish: '#F59E0B25' },
  OTE: { bullish: '#8B5CF625', bearish: '#EC489925' },
  SILVER_BULLET: { bullish: '#F59E0B30', bearish: '#F59E0B30' },
  BREAKER_BLOCK: { bullish: '#06B6D430', bearish: '#F97316 30' },
  MITIGATION_BLOCK: { bullish: '#84CC1630', bearish: '#EF444420' },
  PREMIUM_DISCOUNT: { bullish: '#10B98115', bearish: '#EF444415' },
  EQ_HIGHS_LOWS: { bullish: '#F97316', bearish: '#F97316' },
  POWER_OF_THREE: { bullish: '#A78BFA30', bearish: '#A78BFA30' },
  PDH_PDL: { bullish: '#F8FAFC80', bearish: '#F8FAFC80' },
  NDOG_NWOG: { bullish: '#22D3EE40', bearish: '#22D3EE40' },
  DISPLACEMENT: { bullish: '#10B98150', bearish: '#EF444450' },
};

export default function CandlestickChart({ bars, patterns, loading }: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const volumeRef = useRef<any>(null);
  const priceLineRefs = useRef<any[]>([]);
  const markersApiRef = useRef<any>(null);

  // Initialize chart once
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
        fontSize: 11,
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(59,130,246,0.3)', width: 1, style: 2 as any },
        horzLine: { color: 'rgba(59,130,246,0.3)', width: 1, style: 2 as any },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.05)',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.05)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderDownColor: '#EF4444',
      borderUpColor: '#10B981',
      wickDownColor: '#EF4444',
      wickUpColor: '#10B981',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    } as any);

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;
    volumeRef.current = volumeSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(chartContainerRef.current);

    return () => {
      observer.disconnect();
      markersApiRef.current = null;
      chart.remove();
    };
  }, []);

  // Update data and overlays when bars/patterns change
  useEffect(() => {
    if (!seriesRef.current || !volumeRef.current || !bars || bars.length === 0) return;

    const candleData = bars
      .map((b: Bar) => ({
        time: Math.floor((b?.timestamp ?? 0) / 1000) as any,
        open: b?.open ?? 0,
        high: b?.high ?? 0,
        low: b?.low ?? 0,
        close: b?.close ?? 0,
      }))
      .filter((d: any) => d.time > 0);

    const volumeData = bars
      .map((b: Bar) => ({
        time: Math.floor((b?.timestamp ?? 0) / 1000) as any,
        value: b?.volume ?? 0,
        color: (b?.close ?? 0) >= (b?.open ?? 0) ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
      }))
      .filter((d: any) => d.time > 0);

    try {
      seriesRef.current.setData(candleData);
      volumeRef.current.setData(volumeData);
    } catch (e) {
      console.error('Error setting chart data:', e);
    }

    // --- Remove old price lines ---
    for (const line of priceLineRefs.current) {
      try { seriesRef.current?.removePriceLine?.(line); } catch (_) {}
    }
    priceLineRefs.current = [];

    // --- Add markers using createSeriesMarkers (v5 API) ---
    const markers: any[] = [];
    for (const p of (patterns ?? [])) {
      if (!p) continue;
      // Use the bar at startIndex or find closest by price
      const barIdx = (p as any).startIndex ?? -1;
      const targetBar = (barIdx >= 0 && barIdx < bars.length) ? bars[barIdx] : null;
      const closestBar = targetBar ?? bars.reduce((best: Bar | null, b: Bar) => {
        if (!best) return b;
        const diff = Math.abs((b?.close ?? 0) - (p?.priceLevel ?? 0));
        const bestDiff = Math.abs((best?.close ?? 0) - (p?.priceLevel ?? 0));
        return diff < bestDiff ? b : best;
      }, null);

      if (closestBar && Math.floor((closestBar.timestamp) / 1000) > 0) {
        const isBullish = p?.direction === 'BULLISH';
        const shortLabel = p?.type?.replace?.(/_/g, ' ')?.substring(0, 10) ?? '';
        markers.push({
          time: Math.floor((closestBar.timestamp) / 1000),
          position: isBullish ? 'belowBar' : 'aboveBar',
          color: isBullish ? '#10B981' : '#EF4444',
          shape: isBullish ? 'arrowUp' : 'arrowDown',
          text: shortLabel,
        });
      }

      // --- Add zone price lines for patterns with upper/lower bounds ---
      if (p?.upperBound && p?.lowerBound && p.upperBound !== p.lowerBound) {
        const colors = ZONE_COLORS[p.type] ?? { bullish: '#10B98130', bearish: '#EF444430' };
        const zoneColor = p.direction === 'BULLISH' ? colors.bullish : colors.bearish;
        const borderColor = p.direction === 'BULLISH' ? '#10B981' : '#EF4444';

        // Special colors for specific types
        let upperColor = borderColor;
        let lowerColor = borderColor;
        let lineStyleVal: any = LineStyle.Dashed;
        if (p.type === 'OTE') { upperColor = '#8B5CF6'; lowerColor = '#8B5CF6'; }
        if (p.type === 'SILVER_BULLET') { upperColor = '#F59E0B'; lowerColor = '#F59E0B'; }
        if (p.type === 'PDH_PDL') { upperColor = '#E2E8F0'; lowerColor = '#E2E8F0'; lineStyleVal = LineStyle.Solid; }
        if (p.type === 'EQ_HIGHS_LOWS') { upperColor = '#F97316'; lowerColor = '#F97316'; lineStyleVal = LineStyle.SparseDotted; }
        if (p.type === 'NDOG_NWOG') { upperColor = '#22D3EE'; lowerColor = '#22D3EE'; lineStyleVal = LineStyle.Dashed; }

        try {
          const upperLine = seriesRef.current.createPriceLine({
            price: p.upperBound,
            color: upperColor + '99',
            lineWidth: 1,
            lineStyle: lineStyleVal,
            axisLabelVisible: true,
            title: `${p.type.substring(0, 3)}▲`,
          });
          const lowerLine = seriesRef.current.createPriceLine({
            price: p.lowerBound,
            color: lowerColor + '99',
            lineWidth: 1,
            lineStyle: lineStyleVal,
            axisLabelVisible: false,
            title: `${p.type.substring(0, 3)}▼`,
          });
          priceLineRefs.current.push(upperLine, lowerLine);
        } catch (e) {
          // fallback: just add a single line at priceLevel
        }
      } else if (p?.priceLevel) {
        // Single price line for patterns without bounds (PDH/PDL, EQH/EQL single level)
        const isBullish = p?.direction === 'BULLISH';
        let lineColor = isBullish ? '#10B981' : '#EF4444';
        let lineStyle: any = LineStyle.Dashed;
        if (p.type === 'PDH_PDL') { lineColor = '#E2E8F0'; lineStyle = LineStyle.Solid; }
        if (p.type === 'EQ_HIGHS_LOWS') { lineColor = '#F97316'; lineStyle = LineStyle.SparseDotted; }
        if (p.type === 'NDOG_NWOG') { lineColor = '#22D3EE'; lineStyle = LineStyle.Dashed; }
        if (p.type === 'MSS_BOS') { lineColor = isBullish ? '#3B82F6' : '#EC4899'; lineStyle = LineStyle.LargeDashed; }

        try {
          const pline = seriesRef.current.createPriceLine({
            price: p.priceLevel,
            color: lineColor + '80',
            lineWidth: 1,
            lineStyle,
            axisLabelVisible: true,
            title: p?.type?.replace?.(/_/g, ' ')?.substring(0, 8) ?? '',
          });
          priceLineRefs.current.push(pline);
        } catch (e) {}
      }
    }

    // Sort and deduplicate markers by time
    const seen = new Set<number>();
    const uniqueMarkers = markers
      .sort((a: any, b: any) => (a?.time ?? 0) - (b?.time ?? 0))
      .filter((m: any) => {
        const key = m.time * 1000 + m.text.charCodeAt(0);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    // Use createSeriesMarkers (v5 API - replaces series.setMarkers)
    try {
      if (markersApiRef.current) {
        markersApiRef.current.setMarkers(uniqueMarkers);
      } else {
        markersApiRef.current = createSeriesMarkers(seriesRef.current, uniqueMarkers);
      }
    } catch (e) {
      console.error('Error setting markers:', e);
    }

    chartRef.current?.timeScale()?.fitContent();
  }, [bars, patterns]);

  return (
    <div className="relative w-full h-full min-h-[400px] rounded-lg overflow-hidden bg-[#0D1121]/60 border border-white/5">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0D1121]/80 z-10">
          <div className="flex items-center gap-2 text-gray-400">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading chart data...</span>
          </div>
        </div>
      )}
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
