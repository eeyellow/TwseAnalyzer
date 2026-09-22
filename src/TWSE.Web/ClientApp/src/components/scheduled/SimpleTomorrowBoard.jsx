import React from 'react';
import {
  Briefcase,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  ShieldAlert,
  Flame,
  Zap,
} from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { fmtCurrency, fmtPercent } from '../../utils/formatters';

export default function SimpleTomorrowBoard({
  portfolioAnalysis = [],
  recommendedBuys = [],
  recommendedSells = [],
  reportDate,
  onOpenChart,
  onNavigate,
  onSwitchToLab,
}) {
  const sellHoldings = portfolioAnalysis.filter((p) => p.action === 'Sell');
  const holdOrBuyHoldings = portfolioAnalysis.filter((p) => p.action !== 'Sell');
  const topBuys = recommendedBuys.slice(0, 5);
  const topSells = recommendedSells.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* 1. 明日戰情速覽 KPI 看板 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 持股防守卡片 */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            sellHoldings.length > 0
              ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
              : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
            <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
              <Briefcase className="w-4 h-4 text-sky-500" />
              庫存明日防守狀態
            </span>
            {sellHoldings.length > 0 ? (
              <Badge variant="buy" size="sm" dot pulse>
                需處理
              </Badge>
            ) : (
              <Badge variant="sell" size="sm">
                安全
              </Badge>
            )}
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
            {portfolioAnalysis.length === 0 ? (
              <span className="text-slate-400 text-base font-normal">
                目前無持股部位
              </span>
            ) : sellHoldings.length > 0 ? (
              <span className="text-rose-600 dark:text-rose-400">
                {sellHoldings.length} 檔持股觸發賣出 / 出場
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400">
                全部 {portfolioAnalysis.length} 檔持股健全續抱
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {portfolioAnalysis.length === 0
              ? '無防守壓力，可集中評估明日買進標的'
              : sellHoldings.length > 0
                ? '建議明日開盤掛單調節或果斷停損'
                : '持股均處於多頭或支撐之上，安心續抱'}
          </p>
        </div>

        {/* 明日攻擊首選卡片 */}
        <div className="p-4 rounded-2xl bg-sky-50/50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/50">
          <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
            <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
              <TrendingUp className="w-4 h-4 text-rose-500" />
              明日精選買進 Top 5
            </span>
            <Badge variant="buy" size="sm">
              首選標的
            </Badge>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
            {topBuys.length > 0 ? (
              <span>精選 {topBuys.length} 檔高勝率標的</span>
            ) : (
              <span className="text-slate-400 text-base font-normal">
                今日無強烈買進訊號
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            已自動過濾低流動性冷門股與個股互斥噪聲
          </p>
        </div>

        {/* 避開警戒卡片 */}
        <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50">
          <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
            <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              全市場避開警戒 Top 5
            </span>
            <Badge variant="hold" size="sm">
              防守提醒
            </Badge>
          </div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
            <span>監測到 {topSells.length} 檔轉弱破線</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            技術指標已轉空，明日開盤切勿盲目進場抄底
          </p>
        </div>
      </div>

      {/* 2. 第一戰區：我的持股・明日操作指引 */}
      <Card>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-sky-500" />
              我的庫存・明日行動指令
              <span className="text-xs font-normal text-slate-400 font-mono">
                ({portfolioAnalysis.length} 檔部位)
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              依據今日收盤最新技術面與策略模型，給予明日開盤最直接的操作指引
            </p>
          </div>
          {portfolioAnalysis.length > 0 && onNavigate && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => onNavigate('portfolio')}
            >
              管理持股庫存
            </Button>
          )}
        </div>

        {portfolioAnalysis.length === 0 ? (
          <div className="py-10 text-center rounded-xl bg-slate-50/60 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800">
            <Briefcase className="w-8 h-8 mx-auto text-slate-400 mb-2 opacity-60" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              目前庫存中尚無持股部位
            </p>
            <p className="text-xs text-slate-400 mt-1">
              明日開盤無防守賣出壓力，可參考下方「精選買進標的」規劃佈局
            </p>
            {onNavigate && (
              <Button
                variant="primary"
                size="xs"
                className="mt-3.5"
                onClick={() => onNavigate('portfolio')}
              >
                前往庫存管理新增部位
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {sellHoldings.length > 0 && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                <div className="text-xs text-rose-700 dark:text-rose-300">
                  <span className="font-bold">明日開盤警戒：</span>
                  發現{' '}
                  <b className="font-mono">{sellHoldings.length}</b>{' '}
                  檔持股轉弱或跌破防守線，建議明日開盤果斷掛單調節或停損，保護本金！
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {portfolioAnalysis.map((item) => {
                const isSell = item.action === 'Sell';
                const isBuy = item.action === 'Buy';
                const isProfit = item.profitLoss >= 0;

                return (
                  <div
                    key={item.stockCode}
                    className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                      isSell
                        ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-300 dark:border-rose-900/60 shadow-xs'
                        : 'bg-white dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div
                          className="flex items-center gap-2 cursor-pointer group"
                          onClick={() => onOpenChart(item)}
                        >
                          <span className="font-mono font-bold text-base text-sky-600 dark:text-sky-400 group-hover:underline">
                            {item.stockCode}
                          </span>
                          <span className="font-bold text-slate-800 dark:text-slate-100">
                            {item.stockName}
                          </span>
                        </div>
                        {isSell ? (
                          <Badge variant="buy" size="sm" dot pulse>
                            🔴 建議出場
                          </Badge>
                        ) : isBuy ? (
                          <Badge variant="sell" size="sm" dot pulse>
                            🔺 建議加碼
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            🟢 建議續抱
                          </Badge>
                        )}
                      </div>

                      {/* Numbers Grid */}
                      <div className="grid grid-cols-2 gap-2 text-xs py-2 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 mb-3 font-mono">
                        <div>
                          <span className="text-slate-400 text-[11px] block">
                            持有均價 / 庫存
                          </span>
                          <span className="text-slate-700 dark:text-slate-300 font-semibold">
                            {item.avgCost?.toFixed(2)} 元
                            <span className="text-slate-400 font-normal ml-1">
                              ({item.quantity?.toLocaleString()} 股)
                            </span>
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 text-[11px] block">
                            今日收盤 / 損益
                          </span>
                          <span
                            className={`font-bold ${
                              isProfit ? 'text-rose-500' : 'text-emerald-500'
                            }`}
                          >
                            {item.lastClose?.toFixed(2)} 元
                            <span className="text-[11px] ml-1">
                              ({isProfit ? '+' : ''}
                              {fmtCurrency(item.profitLoss)})
                            </span>
                          </span>
                        </div>
                      </div>

                      {/* Reason */}
                      <div className="text-xs text-slate-600 dark:text-slate-300 mb-3 bg-white dark:bg-slate-900/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                        <span className="text-slate-400 text-[11px] block font-semibold mb-0.5">
                          明日決策關鍵依據：
                        </span>
                        <span>{item.reason || '技術面維持多頭格局，持股續抱'}</span>
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-400 text-[11px]">
                        策略：{item.strategyName || '總體技術診斷'}
                      </span>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => onOpenChart(item)}
                        icon={BarChart3}
                      >
                        看走勢圖
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* 3. 第二戰區：明日精選買進 Top 5 (高勝率首選) */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-rose-500" />
              明日精選買進推薦 Top 5
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20">
                高勝率攻擊清單
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              已排除成交量過小冷門股，依據策略勝率、模型適配權重與籌碼熱度綜合評選
            </p>
          </div>
        </div>

        {topBuys.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <p className="text-sm font-medium">目前市場無符合高勝率買進條件之個股，建議多看少做觀望為宜</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
            {topBuys.map((buy, idx) => {
              const rankTitles = [
                'No. 1 🥇 首選',
                'No. 2 🥈',
                'No. 3 🥉',
                'No. 4',
                'No. 5',
              ];
              const rankTitle = rankTitles[idx] || `No. ${idx + 1}`;

              return (
                <div
                  key={`${buy.stockCode}-${buy.strategyName}`}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-sky-300 dark:hover:border-sky-700/60 transition-all flex flex-col justify-between group shadow-2xs"
                >
                  <div>
                    {/* Rank & Stock */}
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                          idx === 0
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {rankTitle}
                      </span>
                      <Badge variant="purple" size="sm">
                        {buy.strategyName}
                      </Badge>
                    </div>

                    <div
                      className="cursor-pointer mb-3"
                      onClick={() => onOpenChart(buy)}
                    >
                      <div className="font-mono font-bold text-lg text-sky-600 dark:text-sky-400 group-hover:underline">
                        {buy.stockCode}
                      </div>
                      <div className="font-semibold text-slate-800 dark:text-slate-100">
                        {buy.stockName}
                      </div>
                    </div>

                    {/* Price Info */}
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 mb-3 font-mono">
                      <div className="flex items-baseline justify-between">
                        <span className="text-slate-400 text-xs">今日收盤價</span>
                        <span className="text-base font-bold text-slate-900 dark:text-white">
                          {buy.lastClose?.toFixed(2)} 元
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between mt-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/40">
                        <span className="text-sky-600 dark:text-sky-400 text-xs font-sans font-medium">
                          明日參考買進
                        </span>
                        <span className="text-xs font-bold text-sky-600 dark:text-sky-400">
                          {buy.suggestedPrice?.toFixed(2) || buy.lastClose?.toFixed(2)} 元附近
                        </span>
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">
                      {buy.reason || '突破短期整理區間，買盤轉強'}
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    size="xs"
                    className="w-full mt-2"
                    onClick={() => onOpenChart(buy)}
                    icon={BarChart3}
                  >
                    查看 K 線走勢
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 4. 第三戰區：明日風險避開 Top 5 (轉弱防守警戒) */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-emerald-500" />
              明日避開警戒 Top 5
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                空頭轉弱標的
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              以下個股今日技術面出現破線或強烈賣訊，明日盤中切勿盲目接刀抄底
            </p>
          </div>
        </div>

        {topSells.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-xs">
            目前無明顯空頭破位標的
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
            {topSells.map((sell, idx) => (
              <div
                key={`${sell.stockCode}-${sell.strategyName}`}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col justify-between text-xs"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[11px] text-slate-400">
                      避開 #{idx + 1}
                    </span>
                    <Badge variant="sell" size="sm">
                      ⚠️ 轉弱破線
                    </Badge>
                  </div>
                  <div
                    className="cursor-pointer mb-2"
                    onClick={() => onOpenChart(sell)}
                  >
                    <span className="font-mono font-bold text-sky-600 dark:text-sky-400 mr-1.5">
                      {sell.stockCode}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {sell.stockName}
                    </span>
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 font-mono mb-2">
                    今日收盤：<b>{sell.lastClose?.toFixed(2)}</b> 元
                  </div>
                  <div className="text-[11px] text-rose-500/90 dark:text-rose-400/90 line-clamp-2">
                    {sell.reason || '跌破均線支撐，轉為空頭弱勢格局'}
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-800 flex justify-end">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => onOpenChart(sell)}
                    icon={BarChart3}
                  >
                    線圖檢視
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 5. 底部引導切換至進階實驗室 */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-sky-500/10 border border-purple-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              需要查看深度數據與回測分析？
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              深度量化實驗室提供：歷年逐日滾動回放 (2020~2026)、產業與個股專屬適配矩陣、自適應動態學習權重
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onSwitchToLab}
          className="shrink-0 font-semibold"
        >
          切換至深度量化實驗室
          <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}
