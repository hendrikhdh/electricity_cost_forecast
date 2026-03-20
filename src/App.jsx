import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import sto, { SK } from "./storage.js";
import {
  SEASON_FACTORS, DEF_PRESENCE, BOUNDS, getSeason, clamp, daysBetween,
  getDefaultParams, computeBase, forecastDay, getConfBand, getQuality,
  runCalibration,
} from "./model.js";

const APP_VERSION = "1.2.0";
const EXPORT_FORMAT_VERSION = "1.0";
const fmt = (n, d = 0) => n != null ? Number(n).toFixed(d) : "–";
const fmtEur = (n) => n != null ? Number(n).toFixed(2).replace(".", ",") + " €" : "– €";
const fmtKwh = (n) => n != null ? Number(n).toFixed(1).replace(".", ",") + " kWh" : "– kWh";
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const toDS = (d) => d instanceof Date ? d.toISOString().split("T")[0] : d;
const todayStr = () => new Date().toISOString().split("T")[0];
const fullMonth = (m) => ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"][m];
const shortMonth = (m) => ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"][m];
const WD = ["Mo","Di","Mi","Do","Fr","Sa","So"];
const A1 = "#a0bb3c", A2 = "#1c4151";

function DInput({ value, onCommit, style, ...props }) {
  const [local, setLocal] = useState(String(value ?? ""));
  const ref = useRef(null);
  // Sync from parent only when input is NOT focused
  useEffect(() => { if (document.activeElement !== ref.current) setLocal(String(value ?? "")); }, [value]);
  return (
    <input
      ref={ref}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => onCommit(local)}
      style={style}
      {...props}
    />
  );
}

// ============================================================
// THEME HOOK
// ============================================================
function useTheme(dark) {
  return dark ? {
    bg:"#0b1216",bg2:"#111c22",card:"#14222b",text:"#e4eae0",text2:"#7a9299",text3:"#4d6670",
    brd:"#1e3340",accent:A1,petrol:A2,inp:"#162530",modal:"rgba(0,0,0,0.75)",
    red:"#f06060",green:"#5cc06a",yellow:"#e8b830",glow:"rgba(160,187,60,0.15)",glowSoft:"rgba(160,187,60,0.06)",
    chartLine:A1, chartFill:"rgba(160,187,60,0.18)", chartLine2:"#5cc06a", chartFill2:"rgba(92,192,106,0.12)",
  } : {
    bg:"#f2f4ed",bg2:"#e8ebe2",card:"#ffffff",text:"#1a2a30",text2:"#5a7078",text3:"#94a5ab",
    brd:"#d4dbd0",accent:A1,petrol:A2,inp:"#f0f2ea",modal:"rgba(28,65,81,0.25)",
    red:"#d94444",green:"#4da65a",yellow:"#c9a020",glow:"rgba(160,187,60,0.1)",glowSoft:"rgba(160,187,60,0.04)",
    chartLine:A2, chartFill:"rgba(28,65,81,0.12)", chartLine2:"#4da65a", chartFill2:"rgba(77,166,90,0.1)",
  };
}

// ============================================================
// STYLES FACTORY
// ============================================================
function useStyles(th, dark) {
  return useMemo(() => ({
    app: { fontFamily:"'DM Sans',system-ui,sans-serif", background:th.bg, color:th.text, minHeight:"100dvh", maxWidth:430, margin:"0 auto", position:"relative", paddingTop:"env(safe-area-inset-top, 0px)", paddingBottom:"calc(96px + env(safe-area-inset-bottom,20px))", paddingLeft:"env(safe-area-inset-left, 0px)", paddingRight:"env(safe-area-inset-right, 0px)", overflowX:"hidden", width:"100%" },
    header: { padding:"12px 16px 10px", paddingTop:"calc(12px + env(safe-area-inset-top, 0px))", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:30, background:dark?"rgba(11,18,22,0.92)":"rgba(242,244,237,0.92)", backdropFilter:"blur(24px) saturate(180%)" },
    page: { padding:"0 16px 24px", maxWidth:"100%", overflowX:"hidden" },
    tabBar: { position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, zIndex:50, padding:"10px 12px", paddingBottom:"calc(10px + env(safe-area-inset-bottom,20px))", background:dark?"rgba(11,18,22,0.85)":"rgba(255,255,255,0.85)", backdropFilter:"blur(28px) saturate(200%)", borderTop:`0.5px solid ${th.brd}`, boxSizing:"border-box" },
    tabPill: { display:"flex", background:dark?"rgba(30,51,64,0.5)":"rgba(212,219,208,0.45)", borderRadius:16, padding:4, gap:4 },
    tabBtn: (on) => ({ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5, padding:"10px 0", borderRadius:13, border:"none", cursor:"pointer", fontSize:12, fontWeight:on?700:500, color:on?(dark?"#fff":th.petrol):th.text2, background:on?(dark?"rgba(20,34,43,0.95)":"#fff"):"transparent", boxShadow:on?(dark?"0 2px 12px rgba(0,0,0,0.4)":"0 2px 8px rgba(0,0,0,0.08)"):"none", transition:"all 0.28s cubic-bezier(0.22,1,0.36,1)" }),
    card: { background:th.card, borderRadius:20, padding:"18px 16px", marginBottom:12, border:`1px solid ${th.brd}`, position:"relative", overflow:"hidden", boxSizing:"border-box", width:"100%" },
    cardHero: { background:th.card, borderRadius:24, padding:"22px 18px", marginBottom:14, border:`1px solid ${th.brd}`, position:"relative", overflow:"hidden", boxShadow:`0 4px 40px ${th.glow}, 0 0 0 1px ${th.accent}12`, boxSizing:"border-box", width:"100%" },
    accentBar: { position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg, ${A1}, ${A2})` },
    label: { fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:1.5, color:th.text2, marginBottom:8, display:"block" },
    bigNum: { fontSize:32, fontWeight:800, letterSpacing:-1.5, lineHeight:1 },
    medNum: { fontSize:22, fontWeight:800, letterSpacing:-0.5 },
    input: { width:"100%", padding:"14px 16px", borderRadius:14, border:`1.5px solid ${th.brd}`, background:th.inp, color:th.text, fontSize:16, outline:"none", boxSizing:"border-box", transition:"all 0.2s", WebkitAppearance:"none" },
    select: { width:"100%", padding:"14px 16px", borderRadius:14, border:`1.5px solid ${th.brd}`, background:th.inp, color:th.text, fontSize:16, outline:"none", boxSizing:"border-box", appearance:"none", WebkitAppearance:"none" },
    btnP: { background:`linear-gradient(135deg, ${A1}, ${A2})`, color:"#fff", border:"none", borderRadius:16, padding:"16px 0", fontSize:15, fontWeight:700, cursor:"pointer", width:"100%", marginTop:12, boxSizing:"border-box" },
    btnS: { background:"transparent", color:th.accent, border:`2px solid ${th.accent}35`, borderRadius:16, padding:"13px 0", fontSize:13, fontWeight:700, cursor:"pointer", width:"100%", marginTop:10, boxSizing:"border-box" },
    btnX: { background:"none", border:"none", color:th.red, fontSize:13, cursor:"pointer", padding:"4px 8px", fontWeight:700 },
    badge: (c) => ({ display:"inline-flex", alignItems:"center", gap:4, padding:"5px 12px", borderRadius:20, fontSize:11, fontWeight:700, background:(c==="green"?th.green:c==="red"?th.red:th.yellow)+"18", color:c==="green"?th.green:c==="red"?th.red:th.yellow }),
    modal: { position:"fixed", inset:0, background:th.modal, display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:60 },
    sheet: { background:th.card, borderRadius:"28px 28px 0 0", width:"100%", maxWidth:430, padding:"24px 18px", paddingBottom:"calc(24px + env(safe-area-inset-bottom,20px))", maxHeight:"88vh", overflowY:"auto", boxShadow:"0 -8px 40px rgba(0,0,0,0.15)", boxSizing:"border-box" },
    divider: { height:1, background:th.brd, margin:"14px 0" },
    section: { fontSize:17, fontWeight:800, marginBottom:12, marginTop:24, letterSpacing:-0.3 },
    chip: (on) => ({ padding:"10px 12px", borderRadius:12, fontSize:13, fontWeight:700, cursor:"pointer", border:`2px solid ${on?th.accent:th.brd}`, background:on?th.accent+"18":"transparent", color:on?th.accent:th.text2, transition:"all 0.2s", whiteSpace:"nowrap" }),
    closeBtn: { background:th.bg2, border:"none", borderRadius:20, width:34, height:34, fontSize:16, color:th.text2, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  }), [th, dark]);
}

// ============================================================
// MAIN APP
// ============================================================
export default function StromApp() {
  const [dark, setDark] = useState(false);
  const [tab, setTab] = useState(0);
  const [showReading, setShowReading] = useState(false);
  const [showReadingsList, setShowReadingsList] = useState(false);
  const [showStdWeek, setShowStdWeek] = useState(false);
  const [showFormula, setShowFormula] = useState(false);
  const [showCalibConfirm, setShowCalibConfirm] = useState(false);

  const [readings, _setReadings] = useState([]);
  const [persons, _setPersons] = useState([{id:"p1",name:"Person 1"},{id:"p2",name:"Person 2"}]);
  const [calendar, _setCalendar] = useState([]);
  const [contract, _setContract] = useState({pricePerKwh:30,basePrice:12,startDate:new Date().getFullYear()+"-01-01",endDate:new Date().getFullYear()+"-12-31",heatingType:"fernwaerme"});
  const [payments, _setPayments] = useState([]);
  const [modelParams, _setModelParams] = useState(getDefaultParams());
  const [calibLog, _setCalibLog] = useState([]);
  const [stdWeeks, _setStdWeeks] = useState({});
  const [loaded, setLoaded] = useState(false);

  const persist = useCallback((k,v) => sto.set(k,v), []);
  const setReadings = useCallback((v) => { _setReadings(v); persist(SK.READINGS,v); }, [persist]);
  const setPersons = useCallback((v) => { _setPersons(v); persist(SK.PERSONS,v); }, [persist]);
  const setCalendar = useCallback((v) => { _setCalendar(v); persist(SK.CALENDAR,v); }, [persist]);
  const setContract = useCallback((v) => { _setContract(v); persist(SK.CONTRACT,v); }, [persist]);
  const setPayments = useCallback((v) => { _setPayments(v); persist(SK.PAYMENTS,v); }, [persist]);
  const setModelParams = useCallback((v) => { _setModelParams(v); persist(SK.MODEL_PARAMS,v); }, [persist]);
  const setCalibLog = useCallback((v) => { _setCalibLog(v); persist(SK.CALIBRATION_LOG,v); }, [persist]);
  const setStdWeeks = useCallback((v) => { _setStdWeeks(v); persist(SK.STANDARD_WEEKS,v); }, [persist]);

  useEffect(() => {
    (async () => {
      const [r,p,cal,con,pay,mp,cl,s,sw] = await Promise.all([
        sto.get(SK.READINGS),sto.get(SK.PERSONS),sto.get(SK.CALENDAR),sto.get(SK.CONTRACT),
        sto.get(SK.PAYMENTS),sto.get(SK.MODEL_PARAMS),sto.get(SK.CALIBRATION_LOG),sto.get(SK.SETTINGS),sto.get(SK.STANDARD_WEEKS),
      ]);

      // ── Seed test data if no readings exist ──
      if (!r || r.length === 0) {
        const seedReadings = [
          { date: "2026-01-01", kwh: 45200.0, timeOfDay: "morning" },
          { date: "2026-01-22", kwh: 45368.5, timeOfDay: "evening" },
          { date: "2026-02-12", kwh: 45536.2, timeOfDay: "morning" },
          { date: "2026-03-01", kwh: 45669.0, timeOfDay: "evening" },
          { date: "2026-03-18", kwh: 45804.8, timeOfDay: "morning" },
        ];
        const seedPersons = [{ id: "p1", name: "Hendrik" }, { id: "p2", name: "Partnerin" }];
        const seedContract = { pricePerKwh: 28.5, basePrice: 13.90, startDate: "2026-01-01", endDate: "2026-12-31", heatingType: "fernwaerme" };
        const seedPayments = [{ fromDate: "2026-01-01", amount: 95 }];
        const seedStdWeeks = {
          p1: { startDate: "2026-01-06", days: { 0: "office", 1: "office", 2: "office", 3: "office", 4: "office", 5: "home", 6: "home" } },
          p2: { startDate: "2026-01-06", days: { 0: "office", 1: "office", 2: "home", 3: "office", 4: "office", 5: "home", 6: "home" } },
        };
        await Promise.all([
          sto.set(SK.READINGS, seedReadings), sto.set(SK.PERSONS, seedPersons),
          sto.set(SK.CONTRACT, seedContract), sto.set(SK.PAYMENTS, seedPayments),
          sto.set(SK.STANDARD_WEEKS, seedStdWeeks),
        ]);
        _setReadings(seedReadings); _setPersons(seedPersons); _setContract(seedContract);
        _setPayments(seedPayments); _setStdWeeks(seedStdWeeks);
      } else {
        _setReadings(r);
        if(p?.length)_setPersons(p); if(con)_setContract(con); if(pay)_setPayments(pay); if(sw)_setStdWeeks(sw);
      }
      if(cal)_setCalendar(cal); if(mp)_setModelParams(mp); if(cl)_setCalibLog(cl); if(s?.dark!=null)setDark(s.dark);
      setLoaded(true);
    })();
  }, []);

  const toggleDark = useCallback(() => setDark(d => { persist(SK.SETTINGS,{dark:!d}); return !d; }), [persist]);

  const th = useTheme(dark);
  const S = useStyles(th, dark);

  // Effective calendar with std week fill
  const effectiveCalendar = useMemo(() => {
    const manual = [...calendar];
    const ms = new Set(manual.map(c => c.date+"|"+c.personId));
    const filled = [...manual];
    const end = new Date(); end.setMonth(end.getMonth()+3);
    for (const [pid,sw] of Object.entries(stdWeeks)) {
      if (!sw?.startDate||!sw?.days) continue;
      const cursor = new Date(sw.startDate);
      while (cursor <= end) {
        const ds = cursor.toISOString().split("T")[0];
        const wd = (cursor.getDay()+6)%7;
        if (!ms.has(ds+"|"+pid) && sw.days[wd]!=null) filled.push({date:ds,personId:pid,presenceType:sw.days[wd]});
        cursor.setDate(cursor.getDate()+1);
      }
    }
    return filled;
  }, [calendar, stdWeeks]);

  const base = useMemo(() => computeBase(readings), [readings]);
  const nP = persons.length;
  const band = getConfBand(readings.length);
  const quality = getQuality(readings.length);

  const monthForecast = useMemo(() => {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth(), d = daysInMonth(y,m);
    let tot=0,ok=0;
    for (let i=1;i<=d;i++) { const ds=`${y}-${String(m+1).padStart(2,"0")}-${String(i).padStart(2,"0")}`; const v=forecastDay(ds,persons,effectiveCalendar,modelParams,base,nP); if(v!=null){tot+=v;ok++;} }
    if(!ok&&base) return base*d;
    return ok>0?tot:null;
  }, [base,persons,effectiveCalendar,modelParams,nP]);

  const yearForecast = useMemo(() => {
    if(!base)return null; const y=new Date().getFullYear(); let tot=0;
    for(let m=0;m<12;m++){const d=daysInMonth(y,m); for(let i=1;i<=d;i++){const ds=`${y}-${String(m+1).padStart(2,"0")}-${String(i).padStart(2,"0")}`; tot+=forecastDay(ds,persons,effectiveCalendar,modelParams,base,nP)??base;}}
    return tot;
  }, [base,persons,effectiveCalendar,modelParams,nP]);

  // Monthly breakdown for chart
  const monthlyData = useMemo(() => {
    if(!base) return [];
    const y = new Date().getFullYear();
    const sorted = [...payments].sort((a,b)=>a.fromDate.localeCompare(b.fromDate));
    let cumKwh=0, cumCost=0, cumPaid=0;
    return Array.from({length:12},(_,m)=>{
      const d=daysInMonth(y,m); let mKwh=0;
      for(let i=1;i<=d;i++){const ds=`${y}-${String(m+1).padStart(2,"0")}-${String(i).padStart(2,"0")}`; mKwh+=forecastDay(ds,persons,effectiveCalendar,modelParams,base,nP)??base;}
      cumKwh+=mKwh;
      const mCost=(mKwh*contract.pricePerKwh/100)+contract.basePrice;
      cumCost+=mCost;
      const md=`${y}-${String(m+1).padStart(2,"0")}-01`;
      let amt=0; for(const p of sorted){if(p.fromDate<=md)amt=p.amount;} cumPaid+=amt;
      return {name:shortMonth(m),kwh:Math.round(cumKwh),kosten:Math.round(cumCost),abschlag:Math.round(cumPaid)};
    });
  }, [base,persons,effectiveCalendar,modelParams,nP,contract,payments]);

  const yearCost = yearForecast!=null?(yearForecast*contract.pricePerKwh/100)+contract.basePrice*12:null;
  const monthCost = monthForecast!=null?(monthForecast*contract.pricePerKwh/100)+contract.basePrice:null;
  const yearPaid = useMemo(()=>{
    const y=new Date().getFullYear(); let sum=0;
    const sorted=[...payments].sort((a,b)=>a.fromDate.localeCompare(b.fromDate));
    for(let m=0;m<12;m++){const md=`${y}-${String(m+1).padStart(2,"0")}-01`; let amt=0; for(const p of sorted){if(p.fromDate<=md)amt=p.amount;} sum+=amt;}
    return sum;
  },[payments]);
  const delta = yearCost!=null?yearCost-yearPaid:null;

  const doCalibrate = useCallback(() => {
    const np = runCalibration(readings,effectiveCalendar,persons,modelParams);
    setCalibLog([...calibLog,{date:new Date().toISOString(),before:{...modelParams},after:{...np}}]);
    setModelParams(np);
    setShowCalibConfirm(false);
  }, [readings,effectiveCalendar,persons,modelParams,calibLog,setCalibLog,setModelParams]);

  const dayHasReal = useCallback((ds) => {
    if(readings.length<2) return false;
    const s=[...readings].sort((a,b)=>new Date(a.date)-new Date(b.date));
    for(let i=1;i<s.length;i++){if(s[i-1].date<=ds&&s[i].date>=ds)return true;} return false;
  }, [readings]);

  const globalCSS = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;}
    html{height:100%;-webkit-text-size-adjust:100%;}
    body{margin:0;padding:0;background:${th.bg};overscroll-behavior:none;overflow-x:hidden;min-height:100dvh;min-height:-webkit-fill-available;}
    #root{min-height:100dvh;min-height:-webkit-fill-available;}
    input:focus,select:focus{border-color:${th.accent}!important;box-shadow:0 0 0 3px ${th.accent}25!important;}
    input[type="date"]::-webkit-calendar-picker-indicator{filter:${dark?"invert(0.8)":"none"};}
    ::-webkit-scrollbar{width:0;}
    @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}
    .sheet-anim{animation:slideUp 0.3s cubic-bezier(0.22,1,0.36,1)}
    .fade-up{animation:fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) both}
    .fade-up-1{animation-delay:0.05s}.fade-up-2{animation-delay:0.1s}.fade-up-3{animation-delay:0.15s}.fade-up-4{animation-delay:0.2s}
  `;

  if(!loaded) return (
    <div style={{...S.app,display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}>
      <style>{globalCSS}</style>
      <div style={{textAlign:"center"}}>
        <div style={{width:56,height:56,borderRadius:18,background:`linear-gradient(135deg,${A1},${A2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,margin:"0 auto 16px",animation:"pulse 1.5s infinite"}}>⚡</div>
        <div style={{fontSize:14,color:th.text2,fontWeight:600}}>Laden…</div>
      </div>
    </div>
  );

  // ============ READING MODAL ============
  const ReadingModalContent = () => {
    const [d,setD]=useState(todayStr());
    const [k,setK]=useState("");
    const [t2,setT2]=useState("morning");
    const [w,setW]=useState("");
    const add = () => {
      const kwh=parseFloat(k); if(isNaN(kwh))return;
      const sorted=[...readings].sort((a,b)=>new Date(a.date)-new Date(b.date));
      if(sorted.length>0){const last=sorted[sorted.length-1];const dd=daysBetween(last.date,d);
        if(dd>0){const daily=(kwh-last.kwh)/dd; if((daily<0.5||daily>30)&&!window._rc){setW(`Impliziert ${daily.toFixed(1)} kWh/Tag – ${daily<0.5?"sehr niedrig":"sehr hoch"}`);window._rc=true;return;}}}
      window._rc=false;
      const effDate=t2==="morning"?(()=>{const x=new Date(d);x.setDate(x.getDate()-1);return toDS(x);})():d;
      setReadings([...readings,{date:effDate,kwh,timeOfDay:t2}].sort((a,b)=>new Date(a.date)-new Date(b.date)));
      setShowReading(false);
    };
    return (
      <div style={S.modal} onClick={()=>{setShowReading(false);window._rc=false;}}>
        <div className="sheet-anim" style={S.sheet} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
            <span style={{fontSize:20,fontWeight:800}}>⚡ Zählerstand</span>
            <button onClick={()=>setShowReading(false)} style={S.closeBtn}>✕</button>
          </div>
          <div style={{marginBottom:18}}><label style={S.label}>Datum</label><input type="date" value={d} onChange={e=>setD(e.target.value)} style={S.input}/></div>
          <div style={{marginBottom:18}}><label style={S.label}>Zählerstand (kWh)</label>
            <input type="number" inputMode="decimal" step="0.1" value={k} onChange={e=>{setK(e.target.value);setW("");window._rc=false;}} placeholder={readings.length>0?String(readings[readings.length-1].kwh):"z.B. 12345"} style={S.input}/>
          </div>
          <div style={{marginBottom:18}}>
            <label style={S.label}>Zeitpunkt</label>
            <div style={{display:"flex",gap:8}}>
              {[["morning","☀️ Morgens"],["evening","🌙 Abends"]].map(([v,l])=><button key={v} onClick={()=>setT2(v)} style={S.chip(t2===v)}>{l}</button>)}
            </div>
            <div style={{fontSize:11,color:th.text3,marginTop:8}}>{t2==="morning"?"→ Verbrauch zählt für den Vortag":"→ Verbrauch zählt für heute"}</div>
          </div>
          {w&&<div style={{background:th.yellow+"15",border:`1.5px solid ${th.yellow}40`,borderRadius:14,padding:14,fontSize:13,color:th.yellow,marginBottom:14,fontWeight:600}}>⚠️ {w}</div>}
          <button onClick={add} style={S.btnP}>{w?"Trotzdem speichern":"Speichern"}</button>
          <button onClick={()=>{setShowReading(false);setShowReadingsList(true);}} style={S.btnS}>Alle Zählerstände →</button>
        </div>
      </div>
    );
  };

  // ============ READINGS LIST MODAL ============
  const ReadingsListContent = () => (
    <div style={S.modal} onClick={()=>setShowReadingsList(false)}>
      <div className="sheet-anim" style={S.sheet} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <span style={{fontSize:20,fontWeight:800}}>Zählerstände</span>
          <button onClick={()=>setShowReadingsList(false)} style={S.closeBtn}>✕</button>
        </div>
        {readings.length===0?<div style={{textAlign:"center",color:th.text2,padding:40}}>Noch keine Einträge</div>:
          [...readings].sort((a,b)=>new Date(b.date)-new Date(a.date)).map((r,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${th.brd}`}}>
              <div><div style={{fontSize:15,fontWeight:700}}>{new Date(r.date).toLocaleDateString("de-DE")}</div><div style={{fontSize:11,color:th.text2}}>{r.timeOfDay==="morning"?"Morgens":"Abends"}</div></div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:16,fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{fmt(r.kwh,1)}</span>
                <button onClick={()=>setReadings(readings.filter((_,j)=>j!==readings.indexOf(r)))} style={S.btnX}>✕</button>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );

  // ============ STANDARD WEEK MODAL ============
  const StdWeekContent = () => {
    const [lw,setLw] = useState(()=>{
      const w={};
      for(const p of persons){const ex=stdWeeks[p.id]; w[p.id]=ex?{...ex,days:{...ex.days}}:{startDate:todayStr(),days:{0:"office",1:"office",2:"office",3:"office",4:"office",5:"home",6:"home"}};}
      return w;
    });
    const save=()=>{setStdWeeks(lw);setShowStdWeek(false);};
    const pO=[["home","🏠"],["office","💼"],["away","✈️"]];
    return (
      <div style={S.modal} onClick={()=>setShowStdWeek(false)}>
        <div className="sheet-anim" style={{...S.sheet,maxHeight:"92vh"}} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <span style={{fontSize:20,fontWeight:800}}>📋 Standardwoche</span>
            <button onClick={()=>setShowStdWeek(false)} style={S.closeBtn}>✕</button>
          </div>
          <div style={{fontSize:13,color:th.text2,marginBottom:22,lineHeight:1.6}}>
            Typische Woche je Person. Ab dem Startdatum automatisch für folgende Wochen übernommen.
          </div>
          {persons.map(p=>(
            <div key={p.id} style={{marginBottom:24,padding:14,background:th.glowSoft,borderRadius:16,border:`1px solid ${th.brd}`}}>
              <div style={{fontSize:14,fontWeight:800,marginBottom:12,color:th.accent}}>{p.name}</div>
              <div style={{marginBottom:12}}>
                <label style={{...S.label,fontSize:9}}>Gültig ab</label>
                <input type="date" value={lw[p.id]?.startDate||todayStr()} onChange={e=>setLw(prev=>({...prev,[p.id]:{...prev[p.id],startDate:e.target.value}}))} style={{...S.input,padding:"10px 14px",fontSize:14}}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7, 1fr)",gap:4}}>
                {WD.map((day,di)=>(
                  <div key={di} style={{textAlign:"center"}}>
                    <div style={{fontSize:10,fontWeight:700,color:th.text3,marginBottom:5}}>{day}</div>
                    <button onClick={()=>{
                      const cur=lw[p.id]?.days?.[di]||"home";
                      const next=["home","office","away"][(["home","office","away"].indexOf(cur)+1)%3];
                      setLw(prev=>({...prev,[p.id]:{...prev[p.id],days:{...prev[p.id].days,[di]:next}}}));
                    }} style={{width:"100%",aspectRatio:"1",borderRadius:10,border:`1.5px solid ${th.brd}`,background:th.inp,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {pO.find(([k])=>k===(lw[p.id]?.days?.[di]||"home"))?.[1]}
                    </button>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",justifyContent:"center",gap:12,marginTop:8}}>
                {pO.map(([k,icon])=><span key={k} style={{fontSize:10,color:th.text3}}>{icon} {k==="home"?"Zuhause":k==="office"?"Büro":"Weg"}</span>)}
              </div>
            </div>
          ))}
          <button onClick={save} style={S.btnP}>Speichern</button>
        </div>
      </div>
    );
  };

  // ============ FORMULA POPUP ============
  const FormulaContent = () => (
    <div style={S.modal} onClick={()=>setShowFormula(false)}>
      <div className="sheet-anim" style={{...S.sheet,maxHeight:"92vh"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <span style={{fontSize:20,fontWeight:800}}>📐 Berechnungsmodell</span>
          <button onClick={()=>setShowFormula(false)} style={S.closeBtn}>✕</button>
        </div>
        <div style={{fontSize:13,color:th.text2,lineHeight:1.8}}>
          <div style={{fontWeight:800,color:th.text,fontSize:15,marginBottom:10}}>Grundformel pro Tag</div>
          <div style={{background:th.inp,borderRadius:14,padding:"14px 16px",fontFamily:"monospace",fontSize:12,marginBottom:16,overflowX:"auto",border:`1px solid ${th.brd}`,lineHeight:1.6}}>
            kWh/Tag = (Grundlast + Σ(Faktor_i × Personenlast)) × Saisonfaktor
          </div>

          <div style={{fontWeight:800,color:th.text,fontSize:14,marginBottom:8}}>Parameter</div>
          <div style={{marginBottom:14}}>
            <strong>Basis kWh/Tag</strong> = Durchschnitt aller Zählerstandsperioden<br/>
            <strong>Grundlast</strong> = Basis × {fmt(modelParams.grundlastShare*100,0)}% (Geräte im Standby, Kühlschrank etc.)<br/>
            <strong>Personenlast</strong> = Basis × {fmt((1-modelParams.grundlastShare)*100,0)}% ÷ {nP} Personen
          </div>

          <div style={{fontWeight:800,color:th.text,fontSize:14,marginBottom:8}}>Anwesenheitsfaktoren</div>
          <div style={{marginBottom:14}}>
            🏠 Zuhause = 1.00 (Referenz, fix)<br/>
            💼 Büro = {fmt(modelParams.presenceFactors?.office??0.55,2)} (lernend, {BOUNDS.office[0]}–{BOUNDS.office[1]})<br/>
            ✈️ Abwesend = {fmt(modelParams.presenceFactors?.away??0.05,2)} (lernend, {BOUNDS.away[0]}–{BOUNDS.away[1]})
          </div>

          <div style={{fontWeight:800,color:th.text,fontSize:14,marginBottom:8}}>Saisonfaktoren ({({fernwaerme:"Fernwärme",gas:"Gas",waermepumpe:"Wärmepumpe",nachtspeicher:"Nachtspeicher",direkt:"Direkt"})[contract.heatingType]})</div>
          <div style={{marginBottom:14}}>
            ☀️ Sommer = {fmt(modelParams.seasonFactors?.summer,2)}<br/>
            🍂 Übergang = {fmt(modelParams.seasonFactors?.transition,2)}<br/>
            🌸 Frühling/Herbst = {fmt(modelParams.seasonFactors?.spring_fall,2)}<br/>
            ❄️ Winter = {fmt(modelParams.seasonFactors?.winter,2)}
          </div>

          <div style={{fontWeight:800,color:th.text,fontSize:14,marginBottom:8}}>Beispielrechnung</div>
          <div style={{background:th.inp,borderRadius:14,padding:"14px 16px",fontFamily:"monospace",fontSize:11,border:`1px solid ${th.brd}`,lineHeight:1.7,overflowX:"auto"}}>
            {base ? (<>
              Basis = {fmt(base,2)} kWh/Tag<br/>
              Grundlast = {fmt(base*modelParams.grundlastShare,2)} kWh<br/>
              Personenlast/P = {fmt(base*(1-modelParams.grundlastShare)/nP,2)} kWh<br/>
              Bsp. alle zuhause, Frühling:<br/>
              = ({fmt(base*modelParams.grundlastShare,2)} + {nP}×1.0×{fmt(base*(1-modelParams.grundlastShare)/nP,2)}) × {fmt(modelParams.seasonFactors?.spring_fall,2)}<br/>
              = {fmt(forecastDay(todayStr(),persons,effectiveCalendar,modelParams,base,nP),2)} kWh
            </>) : "Noch keine Daten für Beispielrechnung"}
          </div>

          <div style={{fontWeight:800,color:th.text,fontSize:14,marginBottom:8,marginTop:16}}>Kalibrierung (Lernrate)</div>
          <div style={{background:th.inp,borderRadius:14,padding:"14px 16px",fontFamily:"monospace",fontSize:12,border:`1px solid ${th.brd}`,lineHeight:1.6,overflowX:"auto"}}>
            neuer_param = alter_param + 0.20 × (ziel - alter_param)
          </div>
        </div>
      </div>
    </div>
  );

  // ============ CALIBRATION CONFIRM ============
  const CalibConfirmContent = () => (
    <div style={S.modal} onClick={()=>setShowCalibConfirm(false)}>
      <div className="sheet-anim" style={S.sheet} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <span style={{fontSize:20,fontWeight:800}}>⚙️ Modell kalibrieren</span>
          <button onClick={()=>setShowCalibConfirm(false)} style={S.closeBtn}>✕</button>
        </div>
        <div style={{fontSize:14,color:th.text2,lineHeight:1.7,marginBottom:20}}>
          <p style={{marginBottom:12}}>Die Kalibrierung analysiert deine bisherigen Zählerstandsdaten und passt die Modellparameter an dein reales Verbrauchsverhalten an:</p>
          <div style={{background:th.inp,borderRadius:14,padding:"14px 16px",marginBottom:14,border:`1px solid ${th.brd}`}}>
            <div style={{fontWeight:700,color:th.text,marginBottom:6}}>Was wird angepasst?</div>
            <div style={{fontSize:13,lineHeight:1.7}}>
              • <strong>Grundlast-Anteil</strong> – Wird aus Urlaubsperioden (alle abwesend, ≥3 Tage) abgeleitet. Aktuell: {fmt(modelParams.grundlastShare*100,0)}%<br/>
              • <strong>Anwesenheitsfaktoren</strong> – Wie viel Strom verbraucht ihr bei verschiedenen Anwesenheitstypen im Vergleich<br/>
              • <strong>Saisonfaktoren</strong> – Saisonale Schwankungen basierend auf echten Daten
            </div>
          </div>
          <div style={{background:th.inp,borderRadius:14,padding:"14px 16px",border:`1px solid ${th.brd}`}}>
            <div style={{fontWeight:700,color:th.text,marginBottom:6}}>Wie funktioniert das Lernen?</div>
            <div style={{fontSize:13,lineHeight:1.7}}>
              Parameter werden schrittweise angepasst (Lernrate 20%), nie sprunghaft verändert. Jede Kalibrierung nähert die Werte weiter an die Realität an. Parametergrenzen verhindern unrealistische Werte.
            </div>
          </div>
        </div>
        <div style={{fontSize:12,color:th.text3,marginBottom:16,textAlign:"center"}}>
          Vorhandene Daten: {readings.length} Zählerstände
        </div>
        <button onClick={doCalibrate} style={S.btnP}>✅ Ja, Modell jetzt kalibrieren</button>
        <button onClick={()=>setShowCalibConfirm(false)} style={S.btnS}>Abbrechen</button>
      </div>
    </div>
  );

  // ============ CUSTOM TOOLTIP ============
  const ChartTooltip = ({active,payload,label}) => {
    if(!active||!payload?.length) return null;
    return (
      <div style={{background:th.card,border:`1px solid ${th.brd}`,borderRadius:12,padding:"10px 14px",fontSize:12,boxShadow:"0 4px 16px rgba(0,0,0,0.1)"}}>
        <div style={{fontWeight:700,marginBottom:4}}>{label}</div>
        {payload.map((p,i)=><div key={i} style={{color:p.color}}>{p.name}: {p.name==="Kosten"||p.name==="Abschläge"?fmtEur(p.value):fmtKwh(p.value)}</div>)}
      </div>
    );
  };

  // ============ RENDER ============
  return (
    <div style={S.app}>
      <style>{globalCSS}</style>

      {/* Header */}
      <div style={S.header}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:36,height:36,borderRadius:12,background:`linear-gradient(135deg,${A1},${A2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,boxShadow:`0 4px 16px ${th.glow}`}}>⚡</div>
          <span style={{fontSize:20,fontWeight:800,letterSpacing:-0.6}}>StromApp</span>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={toggleDark} style={{background:th.bg2,border:`1px solid ${th.brd}`,borderRadius:12,width:40,height:40,cursor:"pointer",fontSize:16,color:th.text,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{dark?"☀️":"🌙"}</button>
          <button onClick={()=>setShowReading(true)} style={{background:`linear-gradient(135deg,${A1},${A2})`,color:"#fff",border:"none",borderRadius:12,padding:"0 14px",height:40,fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5,flexShrink:0,boxShadow:`0 4px 16px ${th.glow}`,whiteSpace:"nowrap"}}>⚡ Ablesen</button>
        </div>
      </div>

      {/* Content */}
      <div style={S.page}>
        {/* ===== DASHBOARD ===== */}
        {tab===0 && (
          <div>
            {/* Hero */}
            <div style={S.cardHero} className="fade-up">
              <div style={S.accentBar}/>
              <div style={{...S.label,marginTop:6}}>{fullMonth(new Date().getMonth())} {new Date().getFullYear()}</div>
              {base!=null ? (<>
                <div style={{...S.bigNum,background:`linear-gradient(135deg,${th.text} 40%,${th.accent})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",marginBottom:4}}>{fmtKwh(monthForecast)}</div>
                <div style={{fontSize:12,color:th.text3,fontVariantNumeric:"tabular-nums",marginBottom:6}}>
                  ±{fmt(band*100,0)}% → {fmtKwh(monthForecast*(1-band))} – {fmtKwh(monthForecast*(1+band))}
                </div>
                <div style={S.divider}/>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:13,color:th.text2,fontWeight:600}}>Monatskosten</span>
                  <span style={{fontSize:20,fontWeight:800}}>{fmtEur(monthCost)}</span>
                </div>
              </>) : (
                <div style={{color:th.text2,fontSize:14,padding:"16px 0",lineHeight:1.6}}>Mindestens 2 Zählerstände nötig.<br/>Tippe oben auf <strong>⚡ Ablesen</strong>.</div>
              )}
            </div>

            {/* Quality */}
            <div style={S.card} className="fade-up fade-up-1">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:22}}>{quality.i}</span>
                  <div><div style={{fontSize:14,fontWeight:700}}>{quality.t}</div><div style={{fontSize:11,color:th.text3}}>{readings.length} Messwerte · ±{fmt(band*100,0)}%</div></div>
                </div>
                {modelParams.calibrated ? (
                  <div style={{textAlign:"right"}}><div style={S.badge("green")}>Kalibriert</div><div style={{fontSize:10,color:th.text3,marginTop:3}}>{modelParams.lastCalibration?new Date(modelParams.lastCalibration).toLocaleDateString("de-DE"):""}</div></div>
                ) : <div style={S.badge("yellow")}>Unkalibriert</div>}
              </div>
            </div>

            {/* Year forecast */}
            {base!=null && (
              <div style={S.card} className="fade-up fade-up-2">
                <div style={S.label}>Jahresprognose {new Date().getFullYear()}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div><div style={S.medNum}>{fmtKwh(yearForecast)}</div><div style={{fontSize:13,color:th.text2,marginTop:3}}>{fmtEur(yearCost)}</div></div>
                  <div style={{textAlign:"right"}}><div style={{fontSize:10,color:th.text3,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Abschläge</div><div style={{fontSize:17,fontWeight:800,marginTop:3}}>{fmtEur(yearPaid)}</div></div>
                </div>
                <div style={{...S.divider,marginBottom:12}}/>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:14,fontWeight:700}}>{delta>0?"Nachzahlung":"Erstattung"}</span>
                  <span style={{fontSize:24,fontWeight:800,color:delta>0?th.red:th.green,fontVariantNumeric:"tabular-nums"}}>{delta>0?"+":""}{fmtEur(delta)}</span>
                </div>
              </div>
            )}

            {/* Cumulative chart */}
            {base!=null && monthlyData.length>0 && (
              <div style={S.card} className="fade-up fade-up-3">
                <div style={S.label}>Kumulierte Kosten vs. Abschläge</div>
                <div style={{width:"100%",height:200,marginTop:8}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyData} margin={{top:4,right:4,left:-20,bottom:0}}>
                      <defs>
                        <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={th.chartLine} stopOpacity={0.3}/><stop offset="100%" stopColor={th.chartLine} stopOpacity={0.02}/></linearGradient>
                        <linearGradient id="gradPaid" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={th.chartLine2} stopOpacity={0.25}/><stop offset="100%" stopColor={th.chartLine2} stopOpacity={0.02}/></linearGradient>
                      </defs>
                      <XAxis dataKey="name" tick={{fontSize:10,fill:th.text3}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:10,fill:th.text3}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?(v/1000).toFixed(1)+"k":v}/>
                      <Tooltip content={<ChartTooltip/>}/>
                      <Area type="monotone" dataKey="kosten" name="Kosten" stroke={th.chartLine} strokeWidth={2.5} fill="url(#gradCost)" dot={false}/>
                      <Area type="monotone" dataKey="abschlag" name="Abschläge" stroke={th.chartLine2} strokeWidth={2} strokeDasharray="6 3" fill="url(#gradPaid)" dot={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div style={{display:"flex",justifyContent:"center",gap:16,marginTop:8}}>
                  <span style={{fontSize:11,display:"flex",alignItems:"center",gap:4}}><span style={{width:12,height:3,borderRadius:2,background:th.chartLine,display:"inline-block"}}/> Kosten</span>
                  <span style={{fontSize:11,display:"flex",alignItems:"center",gap:4}}><span style={{width:12,height:3,borderRadius:2,background:th.chartLine2,display:"inline-block",borderTop:`1px dashed ${th.chartLine2}`}}/> Abschläge</span>
                </div>
              </div>
            )}

            {/* Stats row */}
            {base!=null && (
              <div style={{display:"flex",gap:8}} className="fade-up fade-up-3">
                <div style={{...S.card,flex:1,textAlign:"center"}}><div style={S.label}>Ø Tag</div><div style={{fontSize:18,fontWeight:800}}>{fmtKwh(base)}</div></div>
                <div style={{...S.card,flex:1,textAlign:"center"}}><div style={S.label}>Personen</div><div style={{fontSize:18,fontWeight:800}}>{nP}</div></div>
                <div style={{...S.card,flex:1,textAlign:"center"}}><div style={S.label}>Heizung</div><div style={{fontSize:11,fontWeight:700,marginTop:4}}>{{fernwaerme:"Fernwärme",gas:"Gas",waermepumpe:"WP",nachtspeicher:"NS",direkt:"Direkt"}[contract.heatingType]}</div></div>
              </div>
            )}

            {readings.length>=2 && (
              <button onClick={()=>setShowCalibConfirm(true)} style={{...S.btnS,display:"flex",alignItems:"center",justifyContent:"center",gap:8}} className="fade-up fade-up-4">
                <span>⚙️</span> Modell kalibrieren
              </button>
            )}
          </div>
        )}

        {/* ===== KALENDER ===== */}
        {tab===1 && <KalenderTab th={th} S={S} persons={persons} calendar={calendar} setCalendar={setCalendar} effectiveCalendar={effectiveCalendar} modelParams={modelParams} base={base} nP={nP} dayHasReal={dayHasReal} setShowStdWeek={setShowStdWeek} />}

        {/* ===== VERTRAG ===== */}
        {tab===2 && <VertragTab th={th} S={S} contract={contract} setContract={setContract} payments={payments} setPayments={setPayments} persons={persons} setPersons={setPersons} modelParams={modelParams} setModelParams={setModelParams} yearPaid={yearPaid} setShowFormula={setShowFormula} />}

        {/* ===== EINSTELLUNGEN ===== */}
        {tab===3 && <SettingsTab th={th} S={S} dark={dark} toggleDark={toggleDark} readings={readings} setReadings={setReadings} calendar={calendar} setCalendar={setCalendar} effectiveCalendar={effectiveCalendar} contract={contract} setContract={setContract} payments={payments} setPayments={setPayments} persons={persons} setPersons={setPersons} stdWeeks={stdWeeks} setStdWeeks={setStdWeeks} modelParams={modelParams} setModelParams={setModelParams} />}
      </div>

      {/* Tab Bar */}
      <div style={S.tabBar}>
        <div style={S.tabPill}>
          {[{icon:"📊",label:"Dashboard"},{icon:"📅",label:"Kalender"},{icon:"📄",label:"Vertrag"},{icon:"⚙️",label:"Mehr"}].map((item,i)=>(
            <button key={i} onClick={()=>setTab(i)} style={S.tabBtn(tab===i)}><span style={{fontSize:15}}>{item.icon}</span><span>{item.label}</span></button>
          ))}
        </div>
      </div>

      {/* Modals */}
      {showReading && <ReadingModalContent/>}
      {showReadingsList && <ReadingsListContent/>}
      {showStdWeek && <StdWeekContent/>}
      {showFormula && <FormulaContent/>}
      {showCalibConfirm && <CalibConfirmContent/>}
    </div>
  );
}

// ============================================================
// KALENDER TAB — top-level component, stable identity
// ============================================================
function KalenderTab({th,S,persons,calendar,setCalendar,effectiveCalendar,modelParams,base,nP,dayHasReal,setShowStdWeek}) {
  const [calM,setCalM] = useState(new Date().getMonth());
  const [calY,setCalY] = useState(new Date().getFullYear());
  const [editDay,setEditDay] = useState(null);

  const days = daysInMonth(calY,calM);
  const firstDay = (new Date(calY,calM,1).getDay()+6)%7;
  const cells = [...Array(firstDay).fill(null),...Array.from({length:days},(_,i)=>i+1)];

  const getP = (date,pid) => {
    const m = calendar.find(c=>c.date===date&&c.personId===pid);
    if(m) return m.presenceType;
    const e = effectiveCalendar.find(c=>c.date===date&&c.personId===pid);
    return e?e.presenceType:"home";
  };
  const isStd = (date,pid) => !calendar.find(c=>c.date===date&&c.personId===pid) && effectiveCalendar.some(c=>c.date===date&&c.personId===pid);
  const setP = (date,pid,type) => {
    const f = calendar.filter(c=>!(c.date===date&&c.personId===pid));
    f.push({date,personId:pid,presenceType:type});
    setCalendar(f);
  };

  const icons = {home:"🏠",office:"💼",away:"✈️"};
  const labels = {home:"Zuhause",office:"Büro",away:"Abwesend"};
  const prev=()=>{if(calM===0){setCalM(11);setCalY(calY-1);}else setCalM(calM-1);};
  const next=()=>{if(calM===11){setCalM(0);setCalY(calY+1);}else setCalM(calM+1);};

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <button onClick={prev} style={{background:th.bg2,border:`1px solid ${th.brd}`,borderRadius:12,width:40,height:40,fontSize:18,cursor:"pointer",color:th.text,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
        <span style={{fontSize:18,fontWeight:800,letterSpacing:-0.3}}>{fullMonth(calM)} {calY}</span>
        <button onClick={next} style={{background:th.bg2,border:`1px solid ${th.brd}`,borderRadius:12,width:40,height:40,fontSize:18,cursor:"pointer",color:th.text,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
      </div>
      <button onClick={()=>setShowStdWeek(true)} style={{...S.btnS,marginTop:0,marginBottom:14,padding:"10px 0",fontSize:13}}>📋 Standardwoche einstellen</button>

      <div style={{display:"grid",gridTemplateColumns:"repeat(7, 1fr)",gap:2,marginBottom:4}}>
        {WD.map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:800,color:th.text3,padding:"4px 0"}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7, 1fr)",gap:3}}>
        {cells.map((day,i)=>{
          if(day===null)return <div key={`e${i}`}/>;
          const ds=`${calY}-${String(calM+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const isT=ds===todayStr();
          const hasR=dayHasReal(ds);
          const fc=forecastDay(ds,persons,effectiveCalendar,modelParams,base,nP);
          return (
            <button key={i} onClick={()=>setEditDay(ds)} style={{background:isT?th.accent+"14":hasR?th.green+"0c":th.card,border:isT?`2px solid ${th.accent}`:`1px solid ${th.brd}`,borderRadius:12,padding:"4px 1px",cursor:"pointer",textAlign:"center",minHeight:56}}>
              <div style={{fontSize:13,fontWeight:isT?800:500,color:th.text}}>{day}</div>
              {fc!=null&&<div style={{fontSize:8,color:hasR?th.green:th.text3,fontWeight:700,marginTop:1,fontVariantNumeric:"tabular-nums"}}>{fmt(fc,1)}</div>}
              <div style={{display:"flex",justifyContent:"center",gap:1,marginTop:1}}>
                {persons.map(p=><span key={p.id} style={{fontSize:7,opacity:isStd(ds,p.id)?0.45:1}}>{icons[getP(ds,p.id)]}</span>)}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{display:"flex",gap:12,marginTop:12,justifyContent:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:11,display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:4,background:th.green,display:"inline-block"}}/> Kalibriert</span>
        <span style={{fontSize:11,display:"flex",alignItems:"center",gap:4,color:th.text3}}><span style={{width:8,height:8,borderRadius:4,background:th.text3,display:"inline-block",opacity:0.4}}/> Geschätzt</span>
        <span style={{fontSize:11,display:"flex",alignItems:"center",gap:4,color:th.text3}}><span style={{opacity:0.45,fontSize:10}}>🏠</span> Std.Woche</span>
      </div>

      {editDay && (
        <div style={S.modal} onClick={()=>setEditDay(null)}>
          <div className="sheet-anim" style={S.sheet} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <span style={{fontSize:18,fontWeight:800}}>{new Date(editDay+"T12:00:00").toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long"})}</span>
              <button onClick={()=>setEditDay(null)} style={S.closeBtn}>✕</button>
            </div>
            {forecastDay(editDay,persons,effectiveCalendar,modelParams,base,nP)!=null && (
              <div style={{...S.card,background:th.glowSoft,borderColor:th.accent+"25",marginBottom:18}}>
                <div style={S.label}>Tagesprognose</div>
                <div style={S.medNum}>{fmtKwh(forecastDay(editDay,persons,effectiveCalendar,modelParams,base,nP))}</div>
              </div>
            )}
            {persons.map(p=>(
              <div key={p.id} style={{marginBottom:18}}>
                <label style={S.label}>{p.name}</label>
                <div style={{display:"flex",gap:6}}>
                  {Object.entries(labels).map(([type,label])=>(
                    <button key={type} onClick={()=>setP(editDay,p.id,type)} style={{...S.chip(getP(editDay,p.id)===type),flex:1,textAlign:"center"}}>{icons[type]} {label}</button>
                  ))}
                </div>
                {isStd(editDay,p.id)&&!calendar.find(c=>c.date===editDay&&c.personId===p.id)&&<div style={{fontSize:10,color:th.text3,marginTop:6}}>📋 Aus Standardwoche</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// VERTRAG TAB — top-level component, stable identity
// Uses DInput (blur-commit) so keyboard stays open
// ============================================================
function VertragTab({th,S,contract,setContract,payments,setPayments,persons,setPersons,modelParams,setModelParams,yearPaid,setShowFormula}) {
  const [showAddPay,setShowAddPay] = useState(false);
  const [npDate,setNpDate] = useState(todayStr().slice(0,7)+"-01");
  const [npAmt,setNpAmt] = useState("");

  const addPay = () => {
    const a = parseFloat(npAmt); if(isNaN(a)) return;
    setPayments([...payments,{fromDate:npDate,amount:a}].sort((a,b)=>a.fromDate.localeCompare(b.fromDate)));
    setShowAddPay(false); setNpAmt("");
  };

  return (
    <div>
      <div style={S.section}>Stromtarif</div>
      <div style={S.card}>
        <div style={S.accentBar}/>
        <div style={{marginBottom:16,marginTop:4}}>
          <label style={S.label}>Arbeitspreis (ct/kWh)</label>
          <DInput type="number" inputMode="decimal" step="0.01" value={contract.pricePerKwh} onCommit={v=>setContract({...contract,pricePerKwh:parseFloat(v)||0})} style={S.input}/>
        </div>
        <div style={{marginBottom:16}}>
          <label style={S.label}>Grundpreis (€/Monat)</label>
          <DInput type="number" inputMode="decimal" step="0.01" value={contract.basePrice} onCommit={v=>setContract({...contract,basePrice:parseFloat(v)||0})} style={S.input}/>
        </div>
        <div style={{display:"flex",gap:12}}>
          <div style={{flex:1}}><label style={S.label}>Von</label><DInput type="date" value={contract.startDate} onCommit={v=>setContract({...contract,startDate:v})} style={S.input}/></div>
          <div style={{flex:1}}><label style={S.label}>Bis</label><DInput type="date" value={contract.endDate} onCommit={v=>setContract({...contract,endDate:v})} style={S.input}/></div>
        </div>
      </div>

      <div style={S.card}>
        <label style={S.label}>Heizungstyp</label>
        <select value={contract.heatingType} onChange={e=>{const ht=e.target.value;setContract({...contract,heatingType:ht});setModelParams({...modelParams,seasonFactors:{...SEASON_FACTORS[ht]}});}} style={S.select}>
          <option value="fernwaerme">Fernwärme</option><option value="gas">Gasheizung</option><option value="waermepumpe">Wärmepumpe</option><option value="nachtspeicher">Nachtspeicher</option><option value="direkt">Direktheizung</option>
        </select>
      </div>

      <div style={S.section}>Abschläge</div>
      <div style={S.card}>
        {payments.length===0?<div style={{color:th.text2,fontSize:13,padding:"8px 0"}}>Noch keine Abschläge</div>:payments.map((p,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:i<payments.length-1?`1px solid ${th.brd}`:"none"}}>
            <span style={{fontSize:14,fontWeight:600}}>Ab {new Date(p.fromDate).toLocaleDateString("de-DE",{month:"long",year:"numeric"})}</span>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:16,fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{fmtEur(p.amount)}</span>
              <button onClick={()=>setPayments(payments.filter((_,j)=>j!==i))} style={S.btnX}>✕</button>
            </div>
          </div>
        ))}
        <div style={S.divider}/>
        <div style={{display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:13,color:th.text2}}>Jahressumme</span>
          <span style={{fontSize:17,fontWeight:800}}>{fmtEur(yearPaid)}</span>
        </div>
        {showAddPay ? (
          <div style={{marginTop:16}}>
            <div style={{marginBottom:12}}><label style={S.label}>Gültig ab</label><input type="date" value={npDate} onChange={e=>setNpDate(e.target.value)} style={S.input}/></div>
            <div style={{marginBottom:12}}><label style={S.label}>Betrag (€/Monat)</label><input type="number" inputMode="decimal" step="0.01" value={npAmt} onChange={e=>setNpAmt(e.target.value)} placeholder="z.B. 110" style={S.input}/></div>
            <div style={{display:"flex",gap:8,alignItems:"stretch"}}>
              <button onClick={addPay} style={{...S.btnP,marginTop:0,flex:1}}>Speichern</button>
              <button onClick={()=>setShowAddPay(false)} style={{background:th.bg2,border:`1px solid ${th.brd}`,borderRadius:14,padding:"0 14px",fontSize:13,color:th.text2,cursor:"pointer",fontWeight:600,flexShrink:0}}>Abbrechen</button>
            </div>
          </div>
        ) : <button onClick={()=>setShowAddPay(true)} style={S.btnS}>+ Abschlag hinzufügen</button>}
      </div>

      <div style={S.section}>Haushalt</div>
      <div style={S.card}>
        {persons.map((p,i)=>(
          <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:i<persons.length-1?10:0}}>
            <DInput value={p.name} onCommit={v=>setPersons(persons.map(x=>x.id===p.id?{...x,name:v}:x))} style={{...S.input,flex:1}}/>
            {persons.length>1&&<button onClick={()=>setPersons(persons.filter(x=>x.id!==p.id))} style={S.btnX}>✕</button>}
          </div>
        ))}
        {persons.length<4&&(
          <button onClick={()=>{const id="p"+(Math.max(...persons.map(x=>parseInt(x.id.slice(1))))+1);setPersons([...persons,{id,name:`Person ${persons.length+1}`}]);}} style={S.btnS}>+ Person</button>
        )}
      </div>

      <div style={S.section}>Modellparameter</div>
      <div style={S.card}>
        {[
          ["Grundlast",fmt(modelParams.grundlastShare*100,0)+"%"],
          ["Büro",fmt(modelParams.presenceFactors?.office??0.55,2)],
          ["Abwesend",fmt(modelParams.presenceFactors?.away??0.05,2)],
          ["Winter",fmt(modelParams.seasonFactors?.winter??1.0,2)],
          ["Sommer",fmt(modelParams.seasonFactors?.summer??1.0,2)],
          ["Status",modelParams.calibrated?"✅ Kalibriert":"⏳ Standard"],
        ].map(([k,v],i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<5?`1px solid ${th.brd}`:"none"}}>
            <span style={{fontSize:13,color:th.text2}}>{k}</span>
            <span style={{fontSize:13,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{v}</span>
          </div>
        ))}
      </div>

      <button onClick={()=>setShowFormula(true)} style={{...S.btnS,marginTop:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
        <span>📐</span> Berechnungsformel anzeigen
      </button>
    </div>
  );
}

// ============================================================
// SETTINGS TAB — Export / Import / Version / Dark Mode
// ============================================================
function SettingsTab({th,S,dark,toggleDark,readings,setReadings,calendar,setCalendar,effectiveCalendar,contract,setContract,payments,setPayments,persons,setPersons,stdWeeks,setStdWeeks,modelParams,setModelParams}) {
  const [expFrom,setExpFrom] = useState(new Date().getFullYear()+"-01-01");
  const [expTo,setExpTo] = useState(todayStr());
  const [importMsg,setImportMsg] = useState(null);
  const [exportMsg,setExportMsg] = useState(null);
  const fileRef = useRef(null);

  // Count what's in range using effectiveCalendar (manual + std week)
  const readingsInRange = readings.filter(r => r.date >= expFrom && r.date <= expTo);
  const calendarInRange = effectiveCalendar.filter(c => c.date >= expFrom && c.date <= expTo);

  // ── EXPORT ──
  const [exportDataUri, setExportDataUri] = useState(null);
  const [exportFileName, setExportFileName] = useState("");

  const doExport = () => {
    try {
      const exportData = {
        _format: "stromapp-export",
        _formatVersion: EXPORT_FORMAT_VERSION,
        appVersion: APP_VERSION,
        exportDate: todayStr(),
        range: { from: expFrom, to: expTo },
        data: {
          readings: readingsInRange,
          calendar: calendarInRange,
          contract: { ...contract },
          payments: [...payments],
          persons: [...persons],
          standardWeeks: { ...stdWeeks },
          modelParams: { ...modelParams },
        }
      };

      const json = JSON.stringify(exportData, null, 2);
      const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(json);
      const fileName = `stromapp-${expFrom}-${expTo}.json`;

      setExportDataUri(dataUri);
      setExportFileName(fileName);
      setExportMsg({ ok: true, text: `Export bereit: ${readingsInRange.length} Zählerstände, ${calendarInRange.length} Aktivitäten, ${payments.length} Abschläge, ${persons.length} Personen, Modellparameter. Tippe auf den Download-Link unten.` });
    } catch (err) {
      setExportMsg({ ok: false, text: `Export fehlgeschlagen: ${err.message}` });
    }
  };

  const doCopy = () => {
    try {
      const exportData = {
        _format: "stromapp-export",
        _formatVersion: EXPORT_FORMAT_VERSION,
        appVersion: APP_VERSION,
        exportDate: todayStr(),
        range: { from: expFrom, to: expTo },
        data: {
          readings: readingsInRange,
          calendar: calendarInRange,
          contract: { ...contract },
          payments: [...payments],
          persons: [...persons],
          standardWeeks: { ...stdWeeks },
          modelParams: { ...modelParams },
        }
      };
      const json = JSON.stringify(exportData, null, 2);
      navigator.clipboard.writeText(json).then(() => {
        setExportMsg({ ok: true, text: "JSON in Zwischenablage kopiert! Du kannst es in eine .json-Datei einfügen." });
      }).catch(() => {
        setExportMsg({ ok: false, text: "Kopieren fehlgeschlagen. Versuche den Download-Link." });
      });
    } catch (err) {
      setExportMsg({ ok: false, text: `Fehler: ${err.message}` });
    }
  };

  // ── IMPORT ──
  const doImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target.result);

        if (raw._format !== "stromapp-export" || !raw._formatVersion) {
          setImportMsg({ ok: false, text: "Ungültiges Dateiformat. Es wird eine StromApp-Exportdatei (.json) erwartet." });
          return;
        }
        if (!raw.data) {
          setImportMsg({ ok: false, text: "Datei enthält keinen Datenbereich." });
          return;
        }

        const d = raw.data;
        const summary = [];

        // 1. Readings — merge, deduplicate by date+timeOfDay
        if (d.readings?.length) {
          const existing = new Set(readings.map(r => r.date + "|" + r.timeOfDay));
          const merged = [...readings];
          let added = 0;
          for (const r of d.readings) {
            if (r.date && r.kwh != null && !existing.has(r.date + "|" + r.timeOfDay)) {
              merged.push({ date: r.date, kwh: Number(r.kwh), timeOfDay: r.timeOfDay || "morning" });
              existing.add(r.date + "|" + r.timeOfDay);
              added++;
            }
          }
          if (added > 0) {
            setReadings(merged.sort((a, b) => new Date(a.date) - new Date(b.date)));
            summary.push(`${added} Zählerstände`);
          }
        }

        // 2. Calendar — merge, deduplicate by date+personId
        if (d.calendar?.length) {
          const existing = new Set(calendar.map(c => c.date + "|" + c.personId));
          const merged = [...calendar];
          let added = 0;
          for (const c of d.calendar) {
            if (c.date && c.personId && !existing.has(c.date + "|" + c.personId)) {
              merged.push({ date: c.date, personId: c.personId, presenceType: c.presenceType || "home" });
              existing.add(c.date + "|" + c.personId);
              added++;
            }
          }
          if (added > 0) {
            setCalendar(merged);
            summary.push(`${added} Aktivitätseinträge`);
          }
        }

        // 3. Contract — overwrite
        if (d.contract && d.contract.pricePerKwh != null) {
          setContract({
            pricePerKwh: Number(d.contract.pricePerKwh),
            basePrice: Number(d.contract.basePrice ?? 0),
            startDate: d.contract.startDate || "",
            endDate: d.contract.endDate || "",
            heatingType: d.contract.heatingType || "fernwaerme",
          });
          summary.push("Vertragsdaten");
        }

        // 4. Payments — merge by fromDate
        if (d.payments?.length) {
          const existing = new Set(payments.map(p => p.fromDate));
          const merged = [...payments];
          let added = 0;
          for (const p of d.payments) {
            if (p.fromDate && p.amount != null && !existing.has(p.fromDate)) {
              merged.push({ fromDate: p.fromDate, amount: Number(p.amount) });
              existing.add(p.fromDate);
              added++;
            }
          }
          if (added > 0) {
            setPayments(merged.sort((a, b) => a.fromDate.localeCompare(b.fromDate)));
            summary.push(`${added} Abschläge`);
          }
        }

        // 5. Persons — overwrite if present
        if (d.persons?.length) {
          setPersons(d.persons.map(p => ({ id: p.id, name: p.name || "Person" })));
          summary.push(`${d.persons.length} Personen`);
        }

        // 6. Standard weeks — overwrite per person
        if (d.standardWeeks && typeof d.standardWeeks === "object" && Object.keys(d.standardWeeks).length > 0) {
          setStdWeeks({ ...stdWeeks, ...d.standardWeeks });
          summary.push("Standardwochen");
        }

        // 7. Model params — overwrite if present and calibrated
        if (d.modelParams && typeof d.modelParams === "object") {
          const mp = d.modelParams;
          if (mp.presenceFactors && mp.seasonFactors) {
            setModelParams({
              grundlastShare: Number(mp.grundlastShare ?? 0.4),
              presenceFactors: { home: 1.0, office: Number(mp.presenceFactors.office ?? 0.55), away: Number(mp.presenceFactors.away ?? 0.05) },
              seasonFactors: { ...mp.seasonFactors },
              lastCalibration: mp.lastCalibration || null,
              calibrated: !!mp.calibrated,
            });
            summary.push("Modellparameter" + (mp.calibrated ? " (kalibriert)" : ""));
          }
        }

        if (summary.length === 0) {
          setImportMsg({ ok: true, text: "Datei gelesen, aber keine neuen Daten zum Importieren gefunden." });
        } else {
          const range = raw.range ? ` Zeitraum: ${new Date(raw.range.from).toLocaleDateString("de-DE")} – ${new Date(raw.range.to).toLocaleDateString("de-DE")}.` : "";
          setImportMsg({ ok: true, text: `Import erfolgreich! Importiert: ${summary.join(", ")}.${range}` });
        }
      } catch (err) {
        setImportMsg({ ok: false, text: `Fehler: ${err.message}` });
      }
    };
    reader.onerror = () => setImportMsg({ ok: false, text: "Datei konnte nicht gelesen werden." });
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div>
      {/* App Info */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg,${A1},${A2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>⚡</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>StromApp</div>
            <div style={{ fontSize: 12, color: th.text2 }}>Stromverbrauchs-Prognose</div>
            <div style={{ fontSize: 11, color: th.text3, marginTop: 2 }}>Version {APP_VERSION}</div>
          </div>
        </div>
      </div>

      {/* Dark Mode */}
      <div style={S.section}>Darstellung</div>
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Dark Mode</div>
            <div style={{ fontSize: 12, color: th.text2 }}>Dunkles Farbschema</div>
          </div>
          <button onClick={toggleDark} style={{
            width: 52, height: 30, borderRadius: 15, border: "none", cursor: "pointer",
            background: dark ? A1 : th.brd, position: "relative", transition: "background 0.3s",
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12, background: "#fff",
              position: "absolute", top: 3, left: dark ? 25 : 3, transition: "left 0.3s",
              boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            }} />
          </button>
        </div>
      </div>

      {/* Export */}
      <div style={S.section}>Daten exportieren</div>
      <div style={S.card}>
        <div style={{ fontSize: 13, color: th.text2, marginBottom: 14, lineHeight: 1.6 }}>
          Exportiert Zählerstände, Aktivitätsdaten (inkl. Standardwoche), Vertrag, Abschläge, Personen und Modellparameter als JSON-Datei.
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Von</label>
            <input type="date" value={expFrom} onChange={e => setExpFrom(e.target.value)} style={S.input} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Bis</label>
            <input type="date" value={expTo} onChange={e => setExpTo(e.target.value)} style={S.input} />
          </div>
        </div>
        <div style={{ background: th.inp, borderRadius: 12, padding: "10px 14px", marginBottom: 12, border: `1px solid ${th.brd}`, fontSize: 12, color: th.text2, lineHeight: 1.7 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Zählerstände</span><strong style={{ color: th.text }}>{readingsInRange.length}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Aktivitätseinträge</span><strong style={{ color: th.text }}>{calendarInRange.length}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Abschläge</span><strong style={{ color: th.text }}>{payments.length}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Personen</span><strong style={{ color: th.text }}>{persons.length}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Modellparameter</span><strong style={{ color: th.text }}>{modelParams.calibrated ? "Kalibriert" : "Standard"}</strong></div>
        </div>
        <button onClick={doExport} style={S.btnP}>📤 Export vorbereiten</button>
        <button onClick={doCopy} style={{...S.btnS,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>📋 Als JSON kopieren</button>
        {exportDataUri && (
          <a
            href={exportDataUri}
            download={exportFileName}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block", marginTop: 12, padding: "14px 16px", borderRadius: 14,
              background: `linear-gradient(135deg, ${A1}20, ${A2}20)`,
              border: `2px solid ${th.accent}`,
              color: th.accent, fontSize: 14, fontWeight: 700, textAlign: "center",
              textDecoration: "none",
            }}
          >
            ⬇️ {exportFileName} herunterladen
          </a>
        )}
        {exportMsg && (
          <div style={{
            marginTop: 12, padding: "12px 14px", borderRadius: 14,
            background: exportMsg.ok ? th.green + "15" : th.red + "15",
            border: `1.5px solid ${exportMsg.ok ? th.green : th.red}40`,
            fontSize: 12, color: exportMsg.ok ? th.green : th.red, fontWeight: 600, lineHeight: 1.5,
          }}>
            {exportMsg.ok ? "✅ " : "❌ "}{exportMsg.text}
          </div>
        )}
      </div>

      {/* Import */}
      <div style={S.section}>Daten importieren</div>
      <div style={S.card}>
        <div style={{ fontSize: 13, color: th.text2, marginBottom: 14, lineHeight: 1.6 }}>
          Importiere eine StromApp-Exportdatei. Zählerstände und Aktivitäten werden ergänzt (keine Duplikate). Vertrag, Personen und Modellparameter werden übernommen.
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={doImport} style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()} style={S.btnP}>📥 JSON-Datei auswählen</button>
        {importMsg && (
          <div style={{
            marginTop: 12, padding: "12px 14px", borderRadius: 14,
            background: importMsg.ok ? th.green + "15" : th.red + "15",
            border: `1.5px solid ${importMsg.ok ? th.green : th.red}40`,
            fontSize: 12, color: importMsg.ok ? th.green : th.red, fontWeight: 600, lineHeight: 1.5,
          }}>
            {importMsg.ok ? "✅ " : "❌ "}{importMsg.text}
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={S.section}>Gespeicherte Daten</div>
      <div style={S.card}>
        {[
          ["Zählerstände", readings.length],
          ["Manuelle Kalendereinträge", calendar.length],
          ["Abschläge", payments.length],
          ["Personen", persons.map(p => p.name).join(", ")],
          ["Standardwochen", Object.keys(stdWeeks).length > 0 ? "Aktiv" : "Nicht gesetzt"],
          ["Heizungstyp", {fernwaerme:"Fernwärme",gas:"Gas",waermepumpe:"Wärmepumpe",nachtspeicher:"Nachtspeicher",direkt:"Direkt"}[contract.heatingType]],
          ["Modell", modelParams.calibrated ? "Kalibriert" : "Standard"],
        ].map(([k, v], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 6 ? `1px solid ${th.brd}` : "none" }}>
            <span style={{ fontSize: 13, color: th.text2 }}>{k}</span>
            <span style={{ fontSize: 13, fontWeight: 700, textAlign: "right", maxWidth: "55%" }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center", padding: "24px 0 8px", fontSize: 11, color: th.text3 }}>
        StromApp v{APP_VERSION} · Made with ⚡
      </div>
    </div>
  );
}
