'use client';
import { useState } from 'react';
import { denseTableLayout, extendedTableLayout } from '@/tests/helpers/virtual-table-layout';
import { VirtualTable } from './table';
import { createTableScenario, scenarioNames, type ScenarioName } from '@/tests/helpers/virtual-table-scenarios';
export default function ScenarioLab({ exit }: { exit: () => void }) {
  const [scenario, setScenario] = useState<ReturnType<typeof createTableScenario> | null>(null);
  const [, render] = useState(0);
  const [error, setError] = useState('');
  const [layout, setLayout] = useState(false);
  const [extended, setExtended] = useState<'long' | 'multi' | 'sanma' | null>(null);
  if (extended) return <VirtualTable view={extendedTableLayout(extended)} now={1_000_000} send={() => {}} next={() => {}} exit={() => setExtended(null)} roomLabel="合成布局验收" />;
  if (layout) return <VirtualTable view={denseTableLayout()} now={1_000_000} send={() => {}} next={() => {}} exit={() => setLayout(false)} roomLabel="布局验收" />;
  if (!scenario) return <main style={{ background: '#172139', color: '#ffe4b9', minHeight: '100dvh', padding: 32 }}>
    <h1>开发牌例验收</h1><p>固定牌山，仅开发环境可见。计时冻结，其他玩家自动过。</p>
    {Object.entries(scenarioNames).map(([key, label]) => <button key={key} style={{ padding: 16, margin: 8, border: '1px solid #c9a56b' }} onClick={() => { setError(''); setScenario(createTableScenario(key as ScenarioName)); }}>{label}</button>)}
    <button onClick={() => setLayout(true)}>密集牌河与副露（布局）</button><button onClick={() => setExtended('long')}>18+9张扩展牌河（布局）</button><button onClick={() => setExtended('multi')}>四组副露与24张牌河（布局）</button><button onClick={() => setExtended('sanma')}>三麻24张牌河（布局）</button><button onClick={exit}>返回试打入口</button>
  </main>;
  return <VirtualTable view={scenario.view()} now={scenario.now} error={error} exit={() => setScenario(null)} next={() => {
    const view = scenario.view();
    const result = scenario.engine.advanceRound({ gameId: view.gameId, roundId: view.roundId });
    setError(result.ok ? '' : '下一局失败'); render(value => value + 1);
  }} send={intent => {
    try { scenario.act(intent); setError(''); } catch (cause) { setError(String(cause)); }
    render(value => value + 1);
  }} />;
}
