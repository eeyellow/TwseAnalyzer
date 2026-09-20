import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchStocks,
  getPortfolio,
  getDailyReport,
  getLocalTracking,
} from './api';

import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import MinimizedDock from './components/layout/MinimizedDock';
import StockChartModal from './components/chart/StockChartModal';

import DashboardPage from './pages/DashboardPage';
import ScheduledPage from './pages/ScheduledPage';
import TrackingPage from './pages/TrackingPage';
import PortfolioPage from './pages/PortfolioPage';
import StrategyPage from './pages/StrategyPage';

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [allStocks, setAllStocks] = useState([]);
  const [activeChartStock, setActiveChartStock] = useState(null);
  const [minimizedCharts, setMinimizedCharts] = useState([]);

  // Live badge counts for sidebar
  const [badgeCounts, setBadgeCounts] = useState({
    signals: 0,
    holdings: 0,
    tracked: 0,
  });

  const loadGlobalMeta = useCallback(async () => {
    try {
      const [stocks, portfolio, report, tracking] = await Promise.all([
        fetchStocks(),
        getPortfolio(),
        getDailyReport(),
        getLocalTracking(),
      ]);

      setAllStocks(stocks || []);
      setBadgeCounts({
        signals: report?.signals?.length || 0,
        holdings: portfolio?.length || 0,
        tracked: tracking?.length || 0,
      });
    } catch (err) {
      console.warn('Failed to load global meta', err);
    }
  }, []);

  useEffect(() => {
    loadGlobalMeta();
  }, [loadGlobalMeta]);

  // Chart window actions
  const handleOpenChart = (stock) => {
    setActiveChartStock(stock);
    setMinimizedCharts((prev) =>
      prev.filter(
        (s) =>
          (s.stockCode || s.code) !== (stock.stockCode || stock.code)
      )
    );
  };

  const handleCloseChart = () => {
    setActiveChartStock(null);
  };

  const handleMinimizeChart = () => {
    if (
      activeChartStock &&
      !minimizedCharts.find(
        (s) =>
          (s.stockCode || s.code) ===
          (activeChartStock.stockCode || activeChartStock.code)
      )
    ) {
      setMinimizedCharts((prev) => [...prev, activeChartStock]);
    }
    setActiveChartStock(null);
  };

  const handleRestoreChart = (stock) => {
    handleOpenChart(stock);
  };

  const handleCloseMinimized = (code) => {
    setMinimizedCharts((prev) =>
      prev.filter((s) => (s.stockCode || s.code) !== code)
    );
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#090d16] text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Collapsible Sidebar Navigation */}
      <Sidebar
        currentPage={page}
        onSelectPage={setPage}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        badgeCounts={badgeCounts}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? 'ml-20' : 'ml-64'
        }`}
      >
        {/* Top Header with Global Search & Actions */}
        <Header
          allStocks={allStocks}
          onOpenChart={handleOpenChart}
          onRefreshData={loadGlobalMeta}
        />

        {/* View Pages */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto pb-24">
          {page === 'dashboard' && (
            <DashboardPage
              onOpenChart={handleOpenChart}
              onNavigate={setPage}
            />
          )}

          {page === 'scheduled' && (
            <ScheduledPage onOpenChart={handleOpenChart} />
          )}

          {page === 'tracking' && (
            <TrackingPage onOpenChart={handleOpenChart} />
          )}

          {page === 'portfolio' && (
            <PortfolioPage onOpenChart={handleOpenChart} />
          )}

          {page === 'analysis' && (
            <StrategyPage
              onOpenChart={handleOpenChart}
              onNavigate={setPage}
            />
          )}
        </main>
      </div>

      {/* Floating K-Line Chart Modal */}
      {activeChartStock && (
        <StockChartModal
          stock={activeChartStock}
          onClose={handleCloseChart}
          onMinimize={handleMinimizeChart}
        />
      )}

      {/* Minimized Stock Charts Dock */}
      <MinimizedDock
        stocks={minimizedCharts}
        onRestore={handleRestoreChart}
        onClose={handleCloseMinimized}
        sidebarCollapsed={sidebarCollapsed}
      />
    </div>
  );
}
