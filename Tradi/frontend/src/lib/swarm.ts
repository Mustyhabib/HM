import { supabase } from "./supabase";

/**
 * Swarm = multi-agent team runs. A preset defines a DAG of specialist agents
 * (macro analyst → sector analyst → editor). One swarm run counts as one
 * quota use for Pro; two uses for Premium is the default costing (owner will
 * finalize server-side in the swarm RPC).
 *
 * Presets are shipped in the Tradi vendored engine at
 * `agent/src/swarm/presets/*.yaml`. The frontend consumes a curated JSON
 * mirror served by the worker or bundled here.
 */

export interface SwarmPreset {
  name: string;                      // slug (yaml file stem)
  title: string;                     // human-readable
  description: string;
  category: SwarmCategory;
  vars: SwarmVar[];                  // user inputs the preset needs
}

export interface SwarmVar {
  key: string;
  label: string;
  placeholder?: string;
  required: boolean;
  default?: string;
}

export type SwarmCategory =
  | "equity"
  | "crypto"
  | "macro"
  | "quant"
  | "sentiment"
  | "risk"
  | "sector"
  | "derivatives"
  | "credit"
  | "committee";

/**
 * Bundled catalogue of all 30 preset teams from the Tradi engine.
 * Mirrors `Tradi/agent/src/swarm/presets/*.yaml`. We ship metadata only —
 * the actual DAG execution lives in the worker.
 */
export const SWARM_PRESETS: SwarmPreset[] = [
  { name: "equity_research_team",          title: "Equity Research Team",         description: "Macro → sector → stock deep dive, editor consolidates into a full report", category: "equity", vars: [{ key: "market", label: "Market", placeholder: "US, HK, A-share", required: true, default: "US" }, { key: "ticker", label: "Ticker", placeholder: "AAPL", required: true }] },
  { name: "quant_strategy_desk",           title: "Quant Strategy Desk",          description: "Factor discovery, backtest, walk-forward validation",                       category: "quant",  vars: [{ key: "universe", label: "Universe", placeholder: "S&P 500", required: true }, { key: "horizon", label: "Horizon", placeholder: "1y", required: false, default: "1y" }] },
  { name: "ml_quant_lab",                  title: "ML Quant Lab",                 description: "ML-driven feature engineering, model training, out-of-sample validation",    category: "quant",  vars: [{ key: "target", label: "Target", placeholder: "5-day forward return", required: true }] },
  { name: "factor_research_committee",     title: "Factor Research Committee",    description: "Alpha factor discovery from the 462-alpha zoo, purity & lookahead audit",  category: "quant",  vars: [{ key: "family", label: "Family", placeholder: "qlib158 | alpha101 | gtja191", required: false, default: "alpha101" }] },
  { name: "statistical_arbitrage_desk",    title: "Statistical Arbitrage Desk",   description: "Mean-reversion pairs, cointegration testing, execution modeling",           category: "quant",  vars: [{ key: "universe", label: "Universe", placeholder: "US equities", required: true }] },
  { name: "pairs_research_lab",            title: "Pairs Research Lab",           description: "Cointegrated pair discovery, spread modeling, entry/exit rules",            category: "quant",  vars: [{ key: "sector", label: "Sector", placeholder: "Tech", required: true }] },
  { name: "crypto_research_lab",           title: "Crypto Research Lab",          description: "On-chain + orderflow + sentiment triangulation on a coin",                   category: "crypto", vars: [{ key: "coin", label: "Coin", placeholder: "BTC, ETH, SOL", required: true, default: "BTC" }] },
  { name: "crypto_trading_desk",           title: "Crypto Trading Desk",          description: "Multi-venue orderflow, funding-rate & derivatives structure analysis",     category: "crypto", vars: [{ key: "pair", label: "Pair", placeholder: "BTC/USDT", required: true, default: "BTC/USDT" }] },
  { name: "macro_rates_fx_desk",           title: "Macro Rates & FX Desk",        description: "Central bank policy, yield curve, cross-currency positioning",              category: "macro",  vars: [{ key: "region", label: "Region", placeholder: "US, EU, JP", required: true, default: "US" }] },
  { name: "macro_strategy_forum",          title: "Macro Strategy Forum",         description: "Top-down macro debate: inflation, growth, liquidity regime",                category: "macro",  vars: [{ key: "horizon", label: "Horizon", placeholder: "6m", required: false, default: "6m" }] },
  { name: "geopolitical_war_room",         title: "Geopolitical War Room",        description: "Event-driven geopolitical scenario planning and market impact",             category: "macro",  vars: [{ key: "event", label: "Event", placeholder: "China–Taiwan tension", required: true }] },
  { name: "global_allocation_committee",   title: "Global Allocation Committee",  description: "Cross-asset regime allocation across equity, bond, FX, commodities",       category: "committee", vars: [{ key: "horizon", label: "Horizon", placeholder: "1y", required: false, default: "1y" }] },
  { name: "global_equities_desk",          title: "Global Equities Desk",         description: "Country and region equity relative-value analysis",                        category: "equity", vars: [{ key: "regions", label: "Regions", placeholder: "US, EU, EM", required: true, default: "US, EU, EM" }] },
  { name: "sector_rotation_team",          title: "Sector Rotation Team",         description: "Business-cycle sector positioning and rotation signals",                    category: "sector", vars: [{ key: "market", label: "Market", placeholder: "US", required: true, default: "US" }] },
  { name: "value_investing_committee",     title: "Value Investing Committee",    description: "Graham–Dodd screening: FCF yield, quality, moat, margin of safety",         category: "committee", vars: [{ key: "market", label: "Market", placeholder: "US", required: true, default: "US" }] },
  { name: "fundamental_research_team",     title: "Fundamental Research Team",    description: "Deep company financials + industry structure + management quality",         category: "equity", vars: [{ key: "ticker", label: "Ticker", placeholder: "MSFT", required: true }] },
  { name: "earnings_research_desk",        title: "Earnings Research Desk",       description: "Pre/post-earnings analysis: guidance, beats/misses, price reaction study", category: "equity", vars: [{ key: "ticker", label: "Ticker", placeholder: "NVDA", required: true }] },
  { name: "event_driven_task_force",       title: "Event-Driven Task Force",      description: "M&A, spin-offs, activist campaigns, catalyst-driven trades",               category: "equity", vars: [{ key: "situation", label: "Situation", placeholder: "MSFT/ATVI merger arb", required: true }] },
  { name: "sentiment_intelligence_team",   title: "Sentiment Intelligence Team",  description: "News + social + options-flow sentiment aggregation",                        category: "sentiment", vars: [{ key: "ticker", label: "Ticker", placeholder: "TSLA", required: true }] },
  { name: "social_alpha_team",             title: "Social Alpha Team",            description: "Reddit/X/StockTwits alpha extraction with noise filtering",                 category: "sentiment", vars: [{ key: "ticker", label: "Ticker", placeholder: "GME", required: true }] },
  { name: "technical_analysis_panel",      title: "Technical Analysis Panel",     description: "Multi-timeframe TA: trend, momentum, support/resistance confluence",       category: "quant",  vars: [{ key: "ticker", label: "Ticker", placeholder: "SPY", required: true, default: "SPY" }] },
  { name: "derivatives_strategy_desk",     title: "Derivatives Strategy Desk",    description: "Options-vol surface, skew, gamma exposure, structured trades",              category: "derivatives", vars: [{ key: "underlying", label: "Underlying", placeholder: "SPX", required: true, default: "SPX" }] },
  { name: "convertible_bond_team",         title: "Convertible Bond Team",        description: "Convertible arb, delta hedging, equity/credit decomposition",               category: "derivatives", vars: [{ key: "issuer", label: "Issuer", placeholder: "TSLA 0% 2026", required: true }] },
  { name: "credit_research_team",          title: "Credit Research Team",         description: "IG/HY credit fundamentals, spread analysis, default modeling",              category: "credit", vars: [{ key: "issuer", label: "Issuer", placeholder: "AT&T", required: true }] },
  { name: "commodity_research_team",       title: "Commodity Research Team",      description: "Supply/demand fundamentals across metals, energy, agri",                    category: "macro",  vars: [{ key: "commodity", label: "Commodity", placeholder: "Copper, Oil, Gold", required: true, default: "Gold" }] },
  { name: "etf_allocation_desk",           title: "ETF Allocation Desk",          description: "Model portfolio construction from thematic and factor ETFs",                category: "committee", vars: [{ key: "objective", label: "Objective", placeholder: "60/40 with tilts", required: true }] },
  { name: "fund_selection_panel",          title: "Fund Selection Panel",         description: "Mutual fund / hedge fund due diligence: alpha, style, capacity",           category: "committee", vars: [{ key: "category", label: "Category", placeholder: "US Large Growth", required: true }] },
  { name: "portfolio_review_board",        title: "Portfolio Review Board",       description: "Existing portfolio risk/return decomposition and rebalance advice",         category: "risk",   vars: [{ key: "portfolio", label: "Portfolio", placeholder: "60/40 SPY/AGG", required: true }] },
  { name: "risk_committee",                title: "Risk Committee",               description: "Portfolio VaR, drawdown, tail-risk, hedging plan",                          category: "risk",   vars: [{ key: "portfolio", label: "Portfolio", placeholder: "60/40 SPY/AGG", required: true }] },
  { name: "investment_committee",          title: "Investment Committee",         description: "Executive summary: buy/hold/sell verdict with bull/bear cases",             category: "committee", vars: [{ key: "ticker", label: "Ticker", placeholder: "AAPL", required: true }] },
];

export const CATEGORY_LABEL: Record<SwarmCategory, string> = {
  equity: "Equity",
  crypto: "Crypto",
  macro: "Macro",
  quant: "Quant",
  sentiment: "Sentiment",
  risk: "Risk",
  sector: "Sector",
  derivatives: "Derivatives",
  credit: "Credit",
  committee: "Committee",
};

/**
 * Start a swarm run. Server RPC `start_swarm_run` enforces plan gate
 * (Pro+ only, Premium counts as 2 uses). Returns the swarm run id.
 */
export async function startSwarmRun(
  preset_name: string,
  user_vars: Record<string, string>,
): Promise<string> {
  const { data, error } = await supabase.rpc("start_swarm_run", {
    p_preset_name: preset_name,
    p_user_vars: user_vars,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) {
    if (error.message.includes("quota_exceeded"))
      throw new Error("You've used all your runs for this billing period. Upgrade your plan.");
    if (error.message.includes("plan_gate"))
      throw new Error("Swarm teams require the Pro or Premium plan.");
    throw new Error(error.message);
  }
  return data as string;
}
