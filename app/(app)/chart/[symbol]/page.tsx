import { ChartClient } from './_components/chart-client';

export default function ChartPage({ params }: { params: { symbol: string } }) {
  return <ChartClient symbol={params?.symbol ?? 'ES=F'} />;
}
