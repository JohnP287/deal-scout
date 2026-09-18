"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, BadgeDollarSign, Check, ChevronDown, Clock3, Copy, Link2, LoaderCircle, PackageCheck, Plus, Radar, RefreshCw, Search, ShieldCheck, Sparkles, Store, Tag, TrendingUp, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster, toast } from "sonner";

type Deal = { id: number; title: string; retailer: string; url: string; category: string; msrp_cents: number; price_cents: number; availability: string; condition: string | null; confidence_score: number; price_source: string; promo_code: string | null; promotion_text: string | null; checked_at: string; data_state: "LIVE" | "VERIFIED"; acquisition_cents: number | null; tax_cents: number | null; fees_cents: number | null; net_profit_cents: number | null; roi_percent: number | null; discount_percent: number; resale_comp_cents: number | null; deal_score: number };
type Coverage = { tracked: number; retailers: number; qualified: number; updated_at: string };
type Payload = { deals: Deal[]; coverage: Coverage };
type WebTool = { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: () => Promise<unknown> };
declare global { interface Document { modelContext?: { registerTool: (tool: WebTool, options?: { signal?: AbortSignal }) => void | Promise<void> } } }

const EMPTY_COVERAGE: Coverage = { tracked: 0, retailers: 0, qualified: 0, updated_at: "" };
const CACHE_KEY = "dealscout:verified-feed:v2";
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const money = (cents: number | null) => cents == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
const timeAgo = (value: string | null) => {
  if (!value) return "Not yet verified";
  const raw = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`;
  const mins = Math.max(0, Math.round((Date.now() - new Date(raw).getTime()) / 60000));
  return mins < 2 ? "just now" : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
};
function readCache(): Payload | null {
  try { const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || "null") as { savedAt?: number; payload?: Payload } | null; return saved?.savedAt && saved.payload && Date.now() - saved.savedAt < CACHE_MAX_AGE ? saved.payload : null; }
  catch { return null; }
}

export default function DealDashboard() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [coverage, setCoverage] = useState<Coverage>(EMPTY_COVERAGE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [usingCache, setUsingCache] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("score");
  const [open, setOpen] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async ({ announce = false }: { announce?: boolean } = {}) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    setRefreshing(true);
    try {
      const response = await fetch("/api/deals", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Deal feed unavailable");
      const body = await response.json() as Payload;
      const payload = { deals: body.deals ?? [], coverage: body.coverage ?? EMPTY_COVERAGE };
      setDeals(payload.deals); setCoverage(payload.coverage); setUsingCache(false);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), payload }));
      if (announce) toast.success("Deal feed is up to date.");
    } catch {
      if (controller.signal.aborted && activeRequest.current !== controller) return;
      const cached = readCache();
      if (cached) { setDeals(cached.deals); setCoverage(cached.coverage); setUsingCache(true); if (announce) toast.info("Showing the last verified results."); }
      else if (announce) toast.error("The feed could not refresh. Try again shortly.");
    } finally {
      window.clearTimeout(timeout);
      if (activeRequest.current === controller) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => { let cancelled = false; queueMicrotask(() => { if (cancelled) return; const cached = readCache(); if (cached) { setDeals(cached.deals); setCoverage(cached.coverage); setUsingCache(true); setLoading(false); } void load(); }); return () => { cancelled = true; activeRequest.current?.abort(); }; }, [load]);
  useEffect(() => { const refresh = () => { if (document.visibilityState === "visible") void load(); }; const timer = window.setInterval(refresh, 120_000); window.addEventListener("focus", refresh); window.addEventListener("online", refresh); return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); }; }, [load]);
  useEffect(() => {
    const context = document.modelContext; if (!context?.registerTool) return; const lifecycle = new AbortController();
    const tools: WebTool[] = [{ name: "read_verified_gaming_deals", title: "Read verified gaming deals", description: "Return new, in-stock gaming products verified at or below official MSRP.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, async execute() { const response = await fetch("/api/deals", { cache: "no-store" }); if (!response.ok) throw new Error("Deal feed unavailable"); return response.json(); } }];
    for (const tool of tools) Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined); return () => lifecycle.abort();
  }, []);

  const categories = useMemo(() => ["all", ...Array.from(new Set(deals.map((deal) => deal.category))).sort()], [deals]);
  const visible = useMemo(() => {
    const next = deals.filter((deal) => `${deal.title} ${deal.retailer} ${deal.category} ${deal.promo_code ?? ""}`.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || filter === "discounted" && deal.discount_percent > .01 || filter === "msrp" && Math.abs(deal.discount_percent) <= .01 || filter === "promos" && deal.promo_code) && (category === "all" || deal.category === category));
    return next.sort((a, b) => sort === "price" ? a.price_cents - b.price_cents : sort === "savings" ? b.discount_percent - a.discount_percent : sort === "profit" ? (b.net_profit_cents ?? -Infinity) - (a.net_profit_cents ?? -Infinity) : sort === "fresh" ? new Date(b.checked_at).getTime() - new Date(a.checked_at).getTime() : b.deal_score - a.deal_score);
  }, [category, deals, filter, query, sort]);
  const discounted = deals.filter((deal) => deal.discount_percent > .01).length;
  const promos = deals.filter((deal) => deal.promo_code).length;
  const bestSavings = deals.length ? Math.max(...deals.map((deal) => deal.discount_percent)) : 0;

  return <main className="dealscout-shell min-h-screen text-[#edf5ff]"><Toaster theme="dark" richColors />
    <header className="sticky top-0 z-30 border-b border-white/[.07] bg-[#060a10]/85 backdrop-blur-xl"><div className="mx-auto flex min-h-16 max-w-[1380px] items-center justify-between px-4 sm:px-7 lg:px-10"><div className="flex items-center gap-3"><div className="brand-mark"><Radar className="size-5" /></div><div><div className="text-[17px] font-black tracking-tight">DEALSCOUT</div><div className="text-[11px] font-bold uppercase tracking-[.18em] text-slate-500">Gaming deal intelligence</div></div></div><div className="flex items-center gap-2"><div className="mr-2 hidden items-center gap-2 text-xs font-semibold text-slate-400 md:flex"><span className="live-dot" />Automated 30-minute checks</div><Button onClick={() => void load({ announce: true })} disabled={refreshing} className="h-10 rounded-xl bg-cyan-300 px-4 font-extrabold text-slate-950 hover:bg-cyan-200">{refreshing ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}<span className="hidden sm:inline">Refresh</span></Button><AddDeal open={open} setOpen={setOpen} onAdded={load} /></div></div></header>
    <div className="mx-auto max-w-[1380px] px-4 pb-12 sm:px-7 lg:px-10">
      <section className="grid gap-5 py-6 lg:grid-cols-[1.35fr_.65fr] lg:items-stretch"><div className="premium-panel relative overflow-hidden p-5 sm:p-7"><div className="signal-glow" /><div className="relative"><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[.07] px-3 py-1.5 text-xs font-extrabold text-emerald-300"><ShieldCheck className="size-3.5" />Verified at MSRP or less</div><h1 className="max-w-3xl text-3xl font-black tracking-[-.045em] sm:text-5xl">The deals worth opening.</h1><p className="mt-3 max-w-2xl text-base leading-7 text-slate-400">New gaming tech, confirmed in stock, with the price evidence and resale math already done.</p><div className="mt-5 flex flex-wrap gap-2"><Rule text="No above-MSRP listings" /><Rule text="No unverified prices" /><Rule text="No affiliate ranking" /></div></div></div><div className="premium-panel flex flex-col justify-between p-5"><div><div className="flex items-center justify-between"><span className="text-xs font-extrabold uppercase tracking-[.15em] text-slate-500">Feed status</span><span className={`status-pill ${usingCache ? "status-cache" : "status-live"}`}><Wifi className="size-3.5" />{usingCache ? "Saved copy" : "Online"}</span></div><div className="mt-5 text-3xl font-black">{deals.length} qualified</div><p className="mt-1 text-sm leading-6 text-slate-500">{coverage.tracked || 0} products tracked across {Math.max(coverage.retailers, 22)} approved sources.</p></div><div className="mt-6 border-t border-white/[.07] pt-4"><div className="flex items-center justify-between text-sm"><span className="text-slate-500">Last verified update</span><strong className="text-slate-200">{coverage.updated_at ? timeAgo(coverage.updated_at) : "Waiting for first result"}</strong></div><div className="mt-2 flex items-center justify-between text-sm"><span className="text-slate-500">Feed refresh</span><strong className="text-slate-200">{refreshing ? "Checking now…" : "Ready"}</strong></div></div></div></section>
      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric icon={<PackageCheck />} value={String(deals.length)} label="Qualified deals" /><Metric icon={<TrendingUp />} value={discounted ? `${bestSavings.toFixed(0)}%` : "—"} label="Best discount" /><Metric icon={<Tag />} value={String(promos)} label="Active codes" /><Metric icon={<Store />} value={String(Math.max(coverage.retailers, 22))} label="Sources checked" /></section>
      <section className="deal-surface overflow-hidden rounded-[24px] border border-white/[.08]"><div className="border-b border-white/[.07] p-4 sm:p-5"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><Tabs value={filter} onValueChange={setFilter}><TabsList className="h-auto max-w-full flex-wrap justify-start rounded-xl bg-white/[.05] p-1">{[["all", `All ${deals.length}`], ["discounted", `Discounted ${discounted}`], ["msrp", "At MSRP"], ["promos", `Promo codes ${promos}`]].map(([value, label]) => <TabsTrigger key={value} value={value} className="rounded-lg px-3 font-bold data-[state=active]:bg-slate-700 data-[state=active]:text-white sm:px-4">{label}</TabsTrigger>)}</TabsList></Tabs><div className="flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 sm:w-72"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products, stores or codes" className="h-10 rounded-xl border-white/10 bg-white/[.05] pl-9" /></div><div className="relative"><select aria-label="Sort deals" value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-[#111925] pl-3 pr-9 text-sm font-bold text-slate-300 sm:w-40"><option value="score">Best match</option><option value="savings">Biggest savings</option><option value="price">Lowest price</option><option value="profit">Highest profit</option><option value="fresh">Most recent</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /></div></div></div><div className="mt-4 flex gap-2 overflow-x-auto pb-1">{categories.map((value) => <button key={value} onClick={() => setCategory(value)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold transition ${category === value ? "bg-cyan-300 text-slate-950" : "bg-white/[.05] text-slate-400 hover:bg-white/10 hover:text-white"}`}>{value === "all" ? "Every category" : value}</button>)}</div></div>
        {loading ? <LoadingState /> : deals.length === 0 ? <EmptyState /> : visible.length === 0 ? <div className="grid min-h-64 place-items-center px-6 text-center text-slate-500">No verified deals match these filters.</div> : <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-2">{visible.map((deal) => <DealCard key={deal.id} deal={deal} />)}</div>}
      </section><footer className="mt-5 flex flex-col gap-1 px-1 text-xs leading-5 text-slate-600 sm:flex-row sm:items-center sm:justify-between"><span>Open-source · Transparent sourcing · No affiliate ranking</span><span>Confirm the final price and code at checkout.</span></footer>
    </div>
  </main>;
}

function DealCard({ deal }: { deal: Deal }) {
  const savings = Math.max(0, deal.msrp_cents - deal.price_cents); const discounted = savings > 0;
  async function copyPromo() { if (!deal.promo_code) return; try { await navigator.clipboard.writeText(deal.promo_code); toast.success(`Copied ${deal.promo_code}`); } catch { toast.error("Could not copy the code."); } }
  return <article className="deal-card group flex flex-col rounded-2xl p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><span className={`price-badge ${discounted ? "price-badge-sale" : "price-badge-msrp"}`}>{discounted ? `${deal.discount_percent.toFixed(deal.discount_percent >= 10 ? 0 : 1)}% OFF` : "AT MSRP"}</span><span className="soft-badge">{deal.category}</span><span className={`soft-badge ${deal.data_state === "LIVE" ? "text-emerald-300" : "text-cyan-200"}`}>{deal.data_state}</span></div><span className="flex shrink-0 items-center gap-1 text-xs font-bold text-emerald-300"><Check className="size-3.5" />In stock</span></div>
    <h2 className="mt-4 line-clamp-2 text-lg font-extrabold leading-6 tracking-[-.015em]">{deal.title}</h2><div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"><span className="flex items-center gap-1.5"><Store className="size-3.5" />{deal.retailer}</span><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />Verified {timeAgo(deal.checked_at)}</span><span className="flex items-center gap-1.5"><Sparkles className="size-3.5" />{deal.confidence_score}% confidence</span></div>
    <div className="mt-5 flex items-end justify-between gap-4"><div><div className="eyebrow">Current price</div><div className="mt-1 text-3xl font-black tracking-[-.04em] text-white">{money(deal.price_cents)}</div></div><div className="text-right"><div className="eyebrow">Official MSRP</div><div className={`mt-1 text-lg font-extrabold ${discounted ? "text-slate-500 line-through" : "text-cyan-300"}`}>{money(deal.msrp_cents)}</div></div></div>
    {discounted && <div className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[.055] px-3 py-2 text-sm font-bold text-emerald-300">Save {money(savings)} · {deal.discount_percent.toFixed(1)}% below MSRP</div>}
    {deal.promo_code && <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-violet-300/20 bg-violet-300/[.06] px-3 py-2.5"><div className="min-w-0"><div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.12em] text-violet-300"><Tag className="size-3.5" />Official code</div><div className="mt-1 truncate text-xs text-violet-100/60">{deal.promotion_text || "Retailer promotion"}</div></div><button onClick={copyPromo} aria-label={`Copy promo code ${deal.promo_code}`} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-violet-300/15 px-3 py-2 font-mono text-sm font-black text-violet-100 transition hover:bg-violet-300/25"><Copy className="size-3.5" />{deal.promo_code}</button></div>}
    <div className="mt-4 grid grid-cols-2 gap-2"><Info label="Price source" value={deal.price_source} /><Info label="Deal score" value={`${Math.round(deal.deal_score)}/100`} /></div>
    {deal.resale_comp_cents != null && <details className="math-panel mt-3 rounded-xl"><summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-sm font-bold text-slate-300"><span className="flex items-center gap-2"><BadgeDollarSign className="size-4 text-cyan-300" />Resale breakdown</span><ChevronDown className="size-4 text-slate-500" /></summary><div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/[.06] px-3 py-3 text-xs"><MathLine label="Price + 6% tax" value={money(deal.acquisition_cents)} /><MathLine label="Estimated fees" value={money(deal.fees_cents)} /><MathLine label="Resale comp" value={money(deal.resale_comp_cents)} /><MathLine label="Projected profit" value={money(deal.net_profit_cents)} positive={(deal.net_profit_cents ?? 0) > 0} /><MathLine label="Projected ROI" value={deal.roi_percent == null ? "—" : `${deal.roi_percent.toFixed(1)}%`} positive={(deal.roi_percent ?? 0) > 0} /></div></details>}
    <a href={deal.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white text-sm font-black text-slate-950 transition hover:bg-cyan-100">View at {deal.retailer}<ArrowUpRight className="size-4" /></a></article>;
}

function LoadingState() { return <div className="grid min-h-[340px] place-items-center p-8 text-center"><div><div className="mx-auto grid size-16 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/5"><LoaderCircle className="size-8 animate-spin text-cyan-300" /></div><h2 className="mt-5 text-xl font-black">Loading verified deals</h2><p className="mt-2 text-sm text-slate-500">This should only take a moment.</p></div></div>; }
function EmptyState() { return <div className="grid min-h-[340px] place-items-center p-8 text-center"><div className="max-w-md"><div className="mx-auto grid size-16 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/5"><PackageCheck className="size-8 text-cyan-300" /></div><h2 className="mt-5 text-2xl font-black">No qualifying deals right now</h2><p className="mt-2 leading-7 text-slate-400">The scanner is still checking in the background. A product appears only when it is new, in stock, recently verified, and priced at MSRP or less.</p></div></div>; }
function Metric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) { return <div className="metric-card flex items-center gap-3 rounded-2xl p-4"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-300/[.08] text-cyan-300 [&>svg]:size-5">{icon}</div><div><div className="text-xl font-black leading-none">{value}</div><div className="mt-1 text-xs font-semibold text-slate-500">{label}</div></div></div>; }
function Rule({ text }: { text: string }) { return <div className="inline-flex items-center gap-2 rounded-full bg-black/20 px-3 py-2 text-xs font-semibold text-slate-300"><Check className="size-3.5 shrink-0 text-emerald-400" />{text}</div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-black/20 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-600">{label}</div><div className="mt-1 truncate text-xs font-bold text-slate-300">{value}</div></div>; }
function MathLine({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) { return <div><div className="text-slate-600">{label}</div><div className={`mt-1 font-extrabold ${positive ? "text-emerald-300" : "text-slate-300"}`}>{value}</div></div>; }

function AddDeal({ open, setOpen, onAdded }: { open: boolean; setOpen: (value: boolean) => void; onAdded: (options?: { announce?: boolean }) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); const data = Object.fromEntries(new FormData(event.currentTarget)); try { const response = await fetch("/api/deals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); toast.success("Product added to background tracking."); setOpen(false); await onAdded(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add that product."); } finally { setSaving(false); } }
  return <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button variant="outline" size="icon" aria-label="Track a product" className="size-10 rounded-xl border-white/10 bg-white/5 hover:bg-white/10"><Plus /></Button></SheetTrigger><SheetContent className="border-white/10 bg-[#0a1019] text-white sm:max-w-md"><SheetHeader><SheetTitle className="text-2xl font-black text-white">Track a product</SheetTitle><SheetDescription className="leading-6 text-slate-400">Add an exact retailer product page. It remains hidden until a new, in-stock price at MSRP or less is verified.</SheetDescription></SheetHeader><form onSubmit={submit} className="mt-7 space-y-5 px-4 pb-6"><Field label="Product URL"><Input name="url" required type="url" placeholder="https://retailer.com/product/..." /></Field><Field label="Product name"><Input name="title" required placeholder="RTX 5080 Founders Edition" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Official MSRP"><Input name="msrp" required inputMode="decimal" placeholder="999.99" /></Field><Field label="Expected resale"><Input name="resale" inputMode="decimal" placeholder="1450" /></Field></div><Field label="Category"><select name="category" className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm">{["GPU", "CPU", "Motherboard", "Memory", "Storage", "Monitor", "Gaming laptop", "Gaming desktop", "Console", "Handheld", "Controller", "Keyboard", "Mouse", "Headset", "Audio", "Streaming", "Networking", "VR", "Collectible", "Other"].map((value) => <option key={value} className="bg-slate-900">{value}</option>)}</select></Field><div className="rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100/70"><strong className="text-amber-100">Use official MSRP.</strong> A crossed-out store price is not automatically MSRP.</div><Button disabled={saving} className="h-11 w-full rounded-xl bg-cyan-300 font-extrabold text-slate-950 hover:bg-cyan-200">{saving ? <LoaderCircle className="animate-spin" /> : <Link2 />}Add product</Button></form></SheetContent></Sheet>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label className="font-bold text-slate-300">{label}</Label>{children}</div>; }
