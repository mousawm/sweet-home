// Sweet Home — the card's styles (one stylesheet in the card's shadow root)
export const CSS = `
:host{display:block;--ink:255,255,255;--s1:8,12,24;--s2:10,15,30;--s3:13,19,36;--hi:#fff;--sheet:#0f172a;--bg:#060a14;--panel:rgba(17,24,43,.58);--panel2:rgba(var(--ink),.04);--line:rgba(var(--ink),.08);--tx:#e7ecf6;--mu:#8b97b2;--teal:#2dd4bf;--amber:#fbbf24;--rose:#fb7185;--violet:#a78bfa;--blue:#60a5fa;--green:#34d399;
  font-family:Inter,'Segoe UI',Roboto,system-ui,sans-serif;color:var(--tx);-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}
ha-icon{--mdc-icon-size:20px;display:inline-flex}
small{font-size:.62em;font-weight:500;opacity:.7;margin-left:2px}
.app{position:relative;min-height:100vh;background:radial-gradient(1200px 700px at 15% -10%,#17305e 0%,transparent 60%),radial-gradient(900px 600px at 100% 10%,#3b1b52 0%,transparent 55%),radial-gradient(900px 700px at 50% 120%,#0d3b44 0%,transparent 60%),var(--bg);overflow:clip;padding:22px 26px 10px}
.aurora{position:absolute;border-radius:50%;filter:blur(90px);opacity:.35;pointer-events:none;animation:drift 26s ease-in-out infinite alternate}
.a1{width:520px;height:520px;background:#2563eb;top:-160px;left:20%}
.a2{width:420px;height:420px;background:#9333ea;top:30%;right:-140px;animation-delay:-8s}
.a3{width:460px;height:460px;background:#0d9488;bottom:-200px;left:-120px;animation-delay:-16s}
@keyframes drift{to{transform:translate(80px,60px) scale(1.15)}}
@media (hover:none){.tile:active,.ibtn:active,.pick:active,.opt:active,.gl:active,.tb:active,.abtn:active{filter:brightness(1.3)}}
/* phones: no grey rectangle from the browser on a tap (it ignores rounded corners); the card's own press effect shows instead */
:host{-webkit-tap-highlight-color:transparent}
@media (hover:none){:host([look=light]) :is(.tile,.ibtn,.pick,.opt,.gl,.tb,.abtn):active{filter:brightness(.93)}:is(.tile,.abtn,.lrow,.mrow,.valve,.dev,.go):active{transform:scale(.97);transition:transform .1s}}
@media (pointer:coarse){.aurora{animation:none}.fl.act{animation-timing-function:steps(8)}.pulse,.valve.on .drops{animation-timing-function:steps(6)}.np.playing .eq i{animation-timing-function:steps(4)}.car.charging .cbarf{animation-timing-function:steps(12)}} /* battery: a drifting backdrop makes every card's backdrop blur recompute each frame, forever */
.top{position:relative;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:18px;flex-wrap:wrap}
.greet{font-size:15px;color:var(--mu);font-weight:500;letter-spacing:.2px}
.clock{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.clock #time{font-size:52px;font-weight:700;letter-spacing:-2px;line-height:1.05;background:linear-gradient(120deg,#fff 30%,#a5b4fc 70%,#5eead4);-webkit-background-clip:text;background-clip:text;color:transparent}
.clock .date{font-size:16px;color:var(--mu);font-weight:500}
/* the gradient is painted inside the clock's box only: room below the line for letters that go under it (Arabic "ص" / "م"), taken back with a negative margin so nothing moves */
.clock #time{padding-bottom:.2em;margin-bottom:-.2em}
.hdr-right{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end}
.chip{display:flex;align-items:center;gap:8px;height:42px;box-sizing:border-box;padding:0 14px 0 7px;padding-inline:7px 14px;border-radius:999px;background:var(--panel);border:1px solid var(--line);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap}
.chip>ha-icon{--mdc-icon-size:16px;width:28px;height:28px;flex:none;border-radius:50%;display:grid;place-items:center;color:var(--c,var(--mu));background:color-mix(in srgb,var(--c,#94a3b8) 18%,transparent)}
.chip.big{padding:0 15px 0 7px;padding-inline:7px 15px;gap:8px}.chip.big>ha-icon{--mdc-icon-size:20px;--c:#fde68a}.chip.big div{display:flex;flex-direction:column;line-height:1.05}.chip.big b{font-size:14.5px}.chip.big span{font-size:10.5px;color:var(--mu);text-transform:capitalize}
.chip.warn{--c:var(--rose);border-color:rgba(251,113,133,.45);background:rgba(244,63,94,.14)}
.chip.good{--c:var(--green)}
.amber{color:var(--amber)!important}.green{color:var(--green)!important}.blue{color:var(--blue)!important}
.persons{display:flex;gap:-6px;margin-left:4px}
.person{position:relative;width:42px;height:42px;box-sizing:border-box;border-radius:50%;background:linear-gradient(135deg,#6366f1,#14b8a6);display:grid;place-items:center;font-weight:700;border:2px solid #0b1222;cursor:pointer;margin-left:-6px}
.person img{width:100%;height:100%;border-radius:50%;object-fit:cover}
.person i{position:absolute;right:-1px;bottom:-1px;width:12px;height:12px;border-radius:50%;border:2px solid #0b1222;background:#64748b}
.person.home i{background:var(--green);box-shadow:0 0 8px var(--green)}
.person.away{filter:grayscale(.7);opacity:.75}

.app{container:app/inline-size}
/* tabs */
.tabs{position:sticky;top:8px;z-index:6;display:flex;gap:6px;padding:6px;margin:0 0 18px;border-radius:20px;background:rgba(var(--s3),.72);border:1px solid var(--line);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);overflow-x:auto;scrollbar-width:none;box-shadow:0 12px 30px -16px rgba(0,0,0,.7)}
.tabs::-webkit-scrollbar{display:none}
.tb{position:relative;display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:14px;font-size:13px;font-weight:600;color:var(--mu);white-space:nowrap;transition:background .25s,color .25s;flex:none}
.tb ha-icon{--mdc-icon-size:19px}
@media (hover:hover){.tb:hover{color:var(--tx);background:rgba(var(--ink),.05)}}
.tb.on{color:var(--hi);background:linear-gradient(135deg,rgba(99,102,241,.42),rgba(20,184,166,.3));box-shadow:inset 0 0 0 1px rgba(var(--ink),.13),inset 0 1px 0 rgba(var(--ink),.1),0 2px 9px -4px rgba(99,102,241,.75)}
.tb .bd{font-style:normal;min-width:18px;height:18px;padding:0 5px;border-radius:9px;display:grid;place-items:center;font-size:10.5px;font-weight:700;color:#0b1222;background:#cbd5e1}
.tb .bd ha-icon{--mdc-icon-size:12px}
.bd.warn{background:var(--rose);color:#fff}.bd.info{background:var(--blue)}.bd.good{background:var(--green)}.bd.pink{background:#f472b6}
.tab{display:none;animation:tabin .35s ease}
.tab.on{display:block}
@keyframes tabin{from{opacity:0;transform:translateY(8px)}}
.tab.from-next{animation:tabnext .3s ease}.tab.from-prev{animation:tabprev .3s ease}
[dir=rtl] .tab.from-next{animation-name:tabprev}[dir=rtl] .tab.from-prev{animation-name:tabnext} /* right to left: the next tab slides in from the left */
@keyframes tabnext{from{opacity:0;transform:translateX(40px)}}@keyframes tabprev{from{opacity:0;transform:translateX(-40px)}}
main{scroll-margin-top:84px}
.home-grid{display:grid;gap:18px;grid-template-columns:minmax(0,1fr) 340px;align-items:start}
.tgrid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));align-items:start}
.alerts{grid-column:1/-1}.alerts:empty{display:none}
.acard .ch>ha-icon{color:var(--rose)}.acard .mrow{cursor:pointer}
.alsec{display:flex;align-items:center;gap:6px}.alsec:first-of-type{margin-top:4px}.alsec ha-icon{--mdc-icon-size:14px}.alsec i{font-style:normal;margin-left:auto;font-size:10.5px;padding:1px 7px;border-radius:999px;background:rgba(244,63,94,.18);color:#fecdd3;letter-spacing:0}
.almore{width:100%;padding:7px;border-radius:10px;font-size:11.5px;color:var(--teal);background:var(--panel2);border:1px dashed var(--line);margin-bottom:6px}
.wrow .rbtn,.swr .rbtn{display:flex;align-items:center;gap:4px;margin-left:6px;padding:5px 9px;border-radius:9px;font-size:11px;font-weight:600;background:rgba(244,63,94,.18);border:1px solid rgba(244,63,94,.45);color:#fecdd3}
.wrow .rbtn ha-icon,.swr .rbtn ha-icon{--mdc-icon-size:14px;color:#fecdd3}
.wrow .ubtn{background:rgba(45,212,191,.16);border-color:rgba(45,212,191,.45);color:#99f6e4}.wrow .ubtn ha-icon{color:#99f6e4}.wrow .rbtn.confirm,.swr .rbtn.confirm{position:relative}
.tgrid.sec{grid-template-columns:minmax(300px,380px) minmax(0,1fr)}
.tgrid.wide1{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)}
/* glance */
.glance{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.gl{display:flex;align-items:center;gap:10px;padding:11px;border-radius:16px;background:var(--panel2);border:1px solid var(--line);text-align:start;min-width:0;transition:transform .2s,border-color .2s,background .2s}
@media (hover:hover){.gl:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--c) 45%,transparent);background:color-mix(in srgb,var(--c) 8%,transparent)}}
.gl .gi{width:34px;height:34px;flex:none;border-radius:11px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 16%,transparent)}
.gl .gi ha-icon{--mdc-icon-size:18px}
.gl div{display:flex;flex-direction:column;min-width:0;line-height:1.2}
.gl span{font-size:10.5px;color:var(--mu)}.gl b{font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gl em{font-style:normal;font-size:10.5px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* option chips + picker sheet */
.picks{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.picks.col{flex-direction:column;align-items:stretch;margin:8px 0;gap:8px} /* v1.21.7: the layout class .col (gap 18px) was leaking in */
.picks:empty{display:none}
.pick{display:flex;align-items:center;gap:8px;padding:8px 10px 8px 11px;padding-inline:11px 10px;border-radius:12px;background:rgba(var(--ink),.05);border:1px solid var(--line);font-size:12px;color:var(--mu);transition:border-color .2s,background .2s;min-width:0}
@media (hover:hover){.pick:hover{border-color:rgba(45,212,191,.45);background:rgba(45,212,191,.08)}}
.pick ha-icon{--mdc-icon-size:16px}.pick b{color:var(--hi);font-weight:600;margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pick .chev{opacity:.6}
.picks:not(.col) .pick b{margin-left:2px}
.sheet-bg{position:fixed;inset:0;overscroll-behavior:contain;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(2,6,23,.55);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)}
.sheet-bg.open{display:flex;animation:fade .2s}
.sheet{width:min(420px,calc(100% - 32px));max-height:72vh;overflow:auto;padding:16px;border-radius:22px;background:var(--sheet);border:1px solid rgba(var(--ink),.12);box-shadow:0 30px 80px -20px rgba(0,0,0,.8);overscroll-behavior:contain;animation:pop .22s cubic-bezier(.2,.8,.2,1)}
@keyframes pop{from{opacity:0;transform:scale(.96) translateY(10px)}}
.sh-h{display:flex;align-items:center;gap:10px;margin-bottom:12px}.sh-h div{flex:1;display:flex;flex-direction:column}.sh-h b{font-size:16px}.sh-h span{font-size:12px;color:var(--mu)}
.opts{display:flex;flex-direction:column;gap:6px}
[data-act],[data-lp]{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:manipulation}
[data-act].lp,[data-lp].lp{transform:scale(.97);transition:transform .12s}[data-lp] img{pointer-events:none}
.phbtns{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:12px}
.phbtn{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:14px;background:rgba(45,212,191,.12);border:1px solid rgba(45,212,191,.4);color:var(--tx);font-size:13px;font-weight:600;cursor:pointer}
.phbtn ha-icon{color:var(--teal);--mdc-icon-size:18px}.phbtn:active{transform:scale(.97)}
.sh-h img{width:34px;height:34px;border-radius:50%;object-fit:cover}
.sh-h>ha-icon{color:var(--teal)}.sheet .dsec:first-of-type{margin-top:4px}
.trow em{font-style:normal;font-size:11.5px;color:var(--mu)}.trow b{font-size:13px;min-width:44px;text-align:right}.trow ha-icon.ac{color:var(--blue);--mdc-icon-size:15px}
.opt{display:flex;align-items:center;gap:10px;width:100%;padding:13px 14px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);font-size:14px;text-align:start;transition:background .15s}
@media (hover:hover){.opt:hover{background:rgba(var(--ink),.08)}}.opt span{flex:1}
.opt.on{border-color:var(--teal);background:rgba(45,212,191,.14)}.opt.on ha-icon{color:var(--teal)}
/* alarm keypad + toast */
.keypad{width:min(340px,calc(100% - 32px))}
.pin-dots{height:34px;display:flex;align-items:center;justify-content:center;gap:12px;margin:6px 0 2px}
.pin-dots i{width:14px;height:14px;border-radius:50%;background:var(--teal);box-shadow:0 0 10px var(--teal)}
.pin-dots span{letter-spacing:6px;color:rgba(var(--ink),.15);font-size:22px}
.pin-dots.shake{animation:shake .4s}
@keyframes shake{20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
.pin-msg{min-height:18px;text-align:center;font-size:12px;color:var(--mu);margin-bottom:8px}.pin-msg.bad{color:var(--rose)}
.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.key{height:58px;border-radius:18px;font-size:22px;font-weight:600;background:var(--panel2);border:1px solid var(--line);transition:background .15s,transform .1s}
@media (hover:hover){.key:hover{background:rgba(var(--ink),.09)}}.key:active{transform:scale(.95)}
.key ha-icon{--mdc-icon-size:22px}
.key.k-ok{background:linear-gradient(135deg,#14b8a6,#6366f1);border:0}.key.k-del{color:var(--mu)}
.toast{position:fixed;left:50%;bottom:28px;z-index:70;transform:translate(-50%,20px);opacity:0;pointer-events:none;padding:11px 18px;border-radius:14px;font-size:13px;font-weight:600;background:#0f172a;border:1px solid rgba(45,212,191,.5);color:#fff;box-shadow:0 16px 40px -10px rgba(0,0,0,.7);transition:opacity .25s,transform .25s}
.toast.show{opacity:1;transform:translate(-50%,0)}.toast.bad{border-color:rgba(251,113,133,.6)}
.lbl ha-icon.chg{color:var(--green)}.lbl ha-icon.lkd{color:var(--green)}.lbl ha-icon.unl{color:var(--rose)}
.lockrow.good ha-icon,.lockrow.good b{color:var(--green)}
.lockrow.bad{border-color:rgba(251,113,133,.5);background:rgba(244,63,94,.12)}.lockrow.bad ha-icon,.lockrow.bad b{color:var(--rose)}
.mrow.open{border-color:rgba(251,113,133,.5);background:rgba(244,63,94,.12)}.mrow.open ha-icon,.mrow.open b{color:var(--rose)}
/* sliders */
.slrow{display:flex;align-items:center;gap:10px;padding:4px 12px 8px}
.slrow ha-icon{--mdc-icon-size:16px;color:var(--mu)}.slrow em{font-style:normal;font-size:11.5px;font-weight:600;width:36px;text-align:right;color:var(--tx)}
.sl{-webkit-appearance:none;appearance:none;flex:1;height:6px;border-radius:3px;outline:none;background:linear-gradient(90deg,var(--c) var(--p),rgba(var(--ink),.1) var(--p));cursor:pointer}
[dir=rtl] .sl{background:linear-gradient(270deg,var(--c) var(--p),rgba(var(--ink),.1) var(--p))} /* right to left: the slider's thumb starts on the right, so its fill does too */
.sl::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid var(--c);box-shadow:0 2px 8px rgba(0,0,0,.4)}
.sl::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid var(--c)}
.sl:focus-visible{box-shadow:0 0 0 3px rgba(45,212,191,.4)}
.lwrap{border-radius:12px;margin-bottom:6px}.lwrap .lrow{margin-bottom:0}
.lwrap.on{background:rgba(251,191,36,.06)}
.swrow{display:flex;align-items:center;gap:10px;padding:2px 12px 10px}.swrow>ha-icon{--mdc-icon-size:16px;color:var(--mu);flex:none}
.sws{display:flex;flex-wrap:wrap;gap:7px}
.sw{position:relative;width:26px;height:26px;border-radius:50%;border:2px solid rgba(var(--ink),.18);background:var(--sw);cursor:pointer;padding:0;flex:none;transition:transform .15s}
@media (hover:hover){.sw:hover{transform:scale(1.1)}}.sw.swcur{border-color:#fff;box-shadow:0 0 0 2px var(--sw),0 0 10px var(--sw)}
.sw.cust{display:grid;place-items:center;background:conic-gradient(red,#ff0,lime,cyan,blue,#f0f,red)}
.sw.cust ha-icon{--mdc-icon-size:14px;color:#fff;filter:drop-shadow(0 0 2px #000)}
.sw.cust input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;border:0;padding:0}
.lwrap .picks.col,.lwrap>.pick{margin:0 10px 8px}
.echo{margin-bottom:6px;border-radius:12px;background:var(--panel2)}
/* AC extras */
.xsw{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.xs{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;font-size:11.5px;color:var(--mu);background:rgba(var(--ink),.05);border:1px solid var(--line)}
.xs ha-icon{--mdc-icon-size:15px}.xs b{font-weight:600}
.xs.on{color:var(--hi);border-color:rgba(45,212,191,.5);background:rgba(45,212,191,.15)}.xs.on ha-icon{color:var(--teal)}
.rtemps{display:flex;gap:8px;overflow-x:auto;margin-bottom:14px;padding-bottom:4px;scrollbar-width:thin}
.rtemp{flex:none;display:flex;align-items:center;gap:7px;padding:9px 12px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);font-size:12px}
.rtemp ha-icon{--mdc-icon-size:16px;color:var(--c)}.rtemp b{color:var(--c);font-size:14px}.rtemp em{font-style:normal;color:var(--blue);font-size:11px}
.fc{display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:8px;border-radius:14px;cursor:pointer;background:linear-gradient(110deg,rgba(251,191,36,.14),transparent);border:1px solid rgba(251,191,36,.25)}
.fc>ha-icon{color:var(--amber)}.fc div{display:flex;flex-direction:column}.fc span{font-size:10.5px;color:var(--mu)}.fc b{font-size:13px}.fc em{font-style:normal;font-size:10.5px;color:var(--mu)}
.col{display:flex;flex-direction:column;gap:18px;min-width:0}
.card.flash{animation:cflash 1.5s ease-out}@keyframes cflash{0%,30%{box-shadow:0 0 0 2px var(--teal),0 0 28px -4px rgba(45,212,191,.6)}100%{box-shadow:0 0 0 0 transparent}}
.tv.pend b,.dac-l span.pend{color:var(--teal);animation:pendp 1s ease-in-out infinite}@keyframes pendp{50%{opacity:.55}}
.card{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:24px;padding:18px;backdrop-filter:blur(22px) saturate(140%);-webkit-backdrop-filter:blur(22px) saturate(140%);box-shadow:0 20px 50px -20px rgba(0,0,0,.6),inset 0 1px 0 rgba(var(--ink),.05);min-width:0}
.ch{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.ch>ha-icon{--mdc-icon-size:20px;color:var(--teal);background:rgba(45,212,191,.12);padding:7px;border-radius:12px}
.ch h3{margin:0;font-size:15px;font-weight:600;flex:1;letter-spacing:.2px}
.pill{font-size:11px;font-weight:600;padding:4px 10px;border-radius:999px;color:var(--c,#cbd5e1);background:color-mix(in srgb,var(--c,#94a3b8) 16%,transparent);border:1px solid color-mix(in srgb,var(--c,#94a3b8) 35%,transparent);white-space:nowrap;max-width:60%;overflow:hidden;text-overflow:ellipsis}
.ibtn{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:var(--panel2);border:1px solid var(--line);transition:.2s}
@media (hover:hover){.ibtn:hover{background:rgba(var(--ink),.1)}}.ibtn.on{background:rgba(45,212,191,.2);border-color:rgba(45,212,191,.5);color:var(--teal)}
.ibtn.big{width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#ec4899,#8b5cf6);border:0}

/* security */
.alarm{display:flex;align-items:center;gap:14px;padding:12px;border-radius:18px;background:linear-gradient(135deg,color-mix(in srgb,var(--c) 18%,transparent),transparent);border:1px solid color-mix(in srgb,var(--c) 30%,transparent);margin-bottom:12px}
.shield{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:color-mix(in srgb,var(--c) 22%,transparent);color:var(--c);cursor:pointer;flex:none;box-shadow:0 0 30px -6px var(--c)}
.shield ha-icon{--mdc-icon-size:32px}.blink{animation:blink .6s infinite}
@keyframes blink{50%{opacity:.3}}
.abtns{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;flex:1}
.abtn{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 0;border-radius:12px;background:var(--panel2);border:1px solid var(--line);font-size:10.5px;color:var(--mu);transition:.2s}
.abtn ha-icon{--mdc-icon-size:18px}@media (hover:hover){.abtn:hover{color:var(--tx)}}
.abtn.on{background:color-mix(in srgb,var(--c) 25%,transparent);color:var(--hi);border-color:var(--c)}
.locks{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:8px;margin-bottom:12px}
.lock{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 4px;border-radius:16px;background:var(--panel2);border:1px solid var(--line);transition:.2s}
.lk-ic{position:relative;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;margin-bottom:4px}
.lk-b{position:absolute;right:-4px;bottom:-4px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:var(--panel2,#1e293b);border:1.5px solid currentColor;font-style:normal}.lk-b ha-icon{--mdc-icon-size:11px}
.lock b{font-size:12px;font-weight:600}.lock span{font-size:11px;color:var(--mu);text-transform:capitalize}
.lock.good .lk-ic{background:rgba(52,211,153,.15);color:var(--green)}
.lock.bad{border-color:rgba(251,113,133,.5);background:rgba(244,63,94,.1)}.lock.bad .lk-ic{background:rgba(244,63,94,.2);color:var(--rose);box-shadow:0 0 18px -4px var(--rose)}
.lock.warn .lk-ic{background:rgba(251,191,36,.18);color:var(--amber)}
.na{opacity:.45}
.confirm{outline:2px solid var(--amber);animation:blink .8s infinite}.tile.confirm{position:relative} /* anchor the tip to the tile, not the card */
.confirm::after{content:attr(data-tip);position:absolute;left:50%;top:-30px;transform:translateX(-50%);background:#fbbf24;color:#111;font-size:11px;font-weight:700;padding:4px 8px;border-radius:8px;white-space:nowrap;z-index:5}
.doors{display:flex;flex-wrap:wrap;gap:6px}
.door{display:flex;align-items:center;gap:5px;padding:6px 10px 6px 7px;padding-inline:7px 10px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);font-size:11.5px;color:var(--mu);cursor:pointer}
.door ha-icon{--mdc-icon-size:16px;color:var(--green)}
.door.open{color:var(--hi);background:rgba(244,63,94,.18);border-color:rgba(251,113,133,.5)}.door.open ha-icon{color:var(--rose)}
.door .dt{display:flex;flex-direction:column;line-height:1.15;min-width:0}.door .dt span{color:var(--hi);font-weight:500}.door .dt small{font-size:10px;color:var(--mu);font-variant-numeric:tabular-nums;white-space:nowrap}
.door:has(.dt small){border-radius:14px;padding-block:5px}.door.open .dt small{color:var(--rose);font-weight:600}.door.recent .dt small{color:var(--amber);font-weight:600}

/* climate */
.acs{display:flex;flex-direction:column;gap:8px}
.acs.full{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px;align-items:start}
.ac{border-radius:16px;background:var(--panel2);border:1px solid var(--line);transition:.25s;overflow:hidden}
.ac.on{border-color:color-mix(in srgb,var(--c) 45%,transparent);background:linear-gradient(100deg,color-mix(in srgb,var(--c) 16%,transparent),transparent 70%)}
.acrow{display:flex;align-items:center;gap:10px;padding:10px 10px 10px 10px;cursor:pointer}
.acic{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:rgba(var(--ink),.05);color:var(--c);flex:none}
.ac.on .acic{background:color-mix(in srgb,var(--c) 22%,transparent)}
.spin-fan_only ha-icon,.spin-cool ha-icon{animation:spin 4s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.acn{flex:1;min-width:0;display:flex;flex-direction:column}.acn b{font-size:13px;font-weight:600}.acn span{font-size:11px;color:var(--mu);text-transform:capitalize;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.act{display:flex;flex-direction:column;align-items:flex-end;line-height:1.15}.act b{font-size:16px;font-weight:700}.act span{font-size:11px;color:var(--mu);display:flex;align-items:center}.act span ha-icon{--mdc-icon-size:12px;color:var(--blue)}
.pow{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:rgba(var(--ink),.06);color:var(--mu);flex:none;transition:.2s}
.pow ha-icon{--mdc-icon-size:17px}.pow.on{background:var(--c,var(--teal));color:#0b1222;box-shadow:0 0 16px -2px var(--c,var(--teal))}
.acctl{padding:4px 12px 12px;display:flex;flex-direction:column;gap:10px;animation:fade .25s}
@keyframes fade{from{opacity:0;transform:translateY(-4px)}}
.tgt{display:flex;align-items:center;justify-content:center;gap:16px}.tv{display:flex;flex-direction:column;align-items:center;min-width:70px}.tv b{font-size:30px;font-weight:700;letter-spacing:-1px}.tv span{font-size:10px;color:var(--mu);text-transform:uppercase;letter-spacing:1px}
.tgt.sm{gap:6px}
.modes{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.mbtn{min-width:52px;padding:6px 6px 5px;border-radius:12px;display:flex;flex-direction:column;align-items:center;gap:2px;background:var(--panel2);border:1px solid var(--line);color:var(--mu)}
.mbtn ha-icon{--mdc-icon-size:18px}.mbtn em{font-style:normal;font-size:9.5px;white-space:nowrap}
.mbtn.on{background:color-mix(in srgb,var(--c) 25%,transparent);border-color:var(--c);color:var(--c)}
.fans{display:flex;gap:5px;justify-content:center;flex-wrap:wrap}.fbtn{font-size:11px;padding:5px 10px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);color:var(--mu);text-transform:capitalize}.fbtn.on{color:var(--hi);border-color:var(--c);background:color-mix(in srgb,var(--c) 22%,transparent)}

/* weather sheet */
.wxnow{display:flex;align-items:center;gap:14px;padding:16px;border-radius:18px;border:1px solid var(--line);background:linear-gradient(135deg,rgba(251,191,36,.18),rgba(96,165,250,.08));cursor:pointer}
.wxnow.night{background:linear-gradient(135deg,rgba(99,102,241,.25),rgba(15,23,42,.2))}.wxnow.cloud{background:linear-gradient(135deg,rgba(148,163,184,.22),rgba(96,165,250,.08))}
.wxnow.rain{background:linear-gradient(135deg,rgba(59,130,246,.28),rgba(30,58,138,.15))}.wxnow.snow{background:linear-gradient(135deg,rgba(226,232,240,.22),rgba(147,197,253,.1))}
.wxnow .wxbig{--mdc-icon-size:54px;color:#fbbf24;filter:drop-shadow(0 0 14px rgba(251,191,36,.45))}
.wxnow.night .wxbig{color:#c7d2fe;filter:drop-shadow(0 0 12px rgba(165,180,252,.4))}.wxnow.cloud .wxbig,.wxnow.snow .wxbig{color:#e2e8f0;filter:none}.wxnow.rain .wxbig{color:#93c5fd;filter:none}
.wxt{flex:1;display:flex;flex-direction:column}.wxt b{font-size:34px;font-weight:700;line-height:1.05}.wxt span{font-size:13px;color:var(--mu)}
.wxhl{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600}.wxhl span{display:flex;align-items:center;gap:2px}.wxhl ha-icon{--mdc-icon-size:15px;color:var(--mu)}
.wxstats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
.wxs{position:relative;display:flex;flex-direction:column;gap:2px;padding:10px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);min-width:0}
.wxs ha-icon{--mdc-icon-size:17px;color:var(--teal)}.wxs span{font-size:10.5px;color:var(--mu);text-transform:uppercase;letter-spacing:.6px}
.wxs b{font-size:16px}.wxs b small{font-size:10px;color:var(--mu);margin-left:2px;font-weight:600}.wxs>small{font-size:10.5px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wxarrow{position:absolute;top:9px;right:9px;font-style:normal;display:flex}.wxarrow ha-icon{--mdc-icon-size:16px;color:#93c5fd}
.wxh{overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:0 16px;overscroll-behavior-x:contain}.wxh::-webkit-scrollbar{display:none}
.wxhin{position:relative;display:flex;padding-top:4px}
.wxcurve{position:absolute;left:0;top:68px;pointer-events:none}
.wxhc{flex:none;width:54px;display:flex;flex-direction:column;align-items:center;gap:4px}
.wxhc span{font-size:11px;color:var(--mu);white-space:nowrap}.wxhc ha-icon{--mdc-icon-size:22px;color:#e2e8f0}
.wxhc b{font-size:13px;margin-bottom:36px}.wxhc em{font-style:normal;font-size:10.5px;color:#60a5fa;min-height:14px}.wxhc em small{font-size:9px}
.wxdays{display:flex;flex-direction:column;gap:6px}
.wxd{display:grid;grid-template-columns:44px 24px 46px 34px 1fr 34px;align-items:center;gap:8px;padding:9px 12px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);font-size:13px}
.wxd>span{font-weight:600}.wxd>ha-icon{--mdc-icon-size:21px;color:#e2e8f0}
.wxd em{font-style:normal;font-size:11px;color:#60a5fa;display:flex;align-items:center;white-space:nowrap}.wxd em ha-icon{--mdc-icon-size:12px}.wxd em small{font-size:9px;margin-left:1px}
.wxd b{text-align:right}.wxd b.lo{color:var(--mu);font-weight:500}
.wxbar{position:relative;height:6px;border-radius:3px;background:rgba(var(--ink),.07)}.wxbar i{position:absolute;top:0;bottom:0;border-radius:3px}
.wxbar .wxnowdot{width:10px;height:10px;top:-2px;margin-left:-5px;border-radius:50%;background:#fff;border:2px solid #0f172a;box-shadow:0 0 6px rgba(var(--ink),.6)}
.wxwait{padding:20px;text-align:center;color:var(--mu);font-size:12px}
.wxfoot{margin-top:12px;font-size:10.5px;color:var(--mu);text-align:center;opacity:.7}

/* power sheet */
.pwbig{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.pwb{display:flex;flex-direction:column;gap:2px;padding:12px 10px;border-radius:16px;cursor:pointer;min-width:0;border:1px solid color-mix(in srgb,var(--c) 35%,transparent);background:linear-gradient(160deg,color-mix(in srgb,var(--c) 16%,transparent),transparent)}
.pwb ha-icon{--mdc-icon-size:20px;color:var(--c)}.pwb span{font-size:10.5px;color:var(--mu);text-transform:uppercase;letter-spacing:.6px;margin-top:4px}
.pwb b{font-size:20px;font-weight:700}.pwb b small{font-size:11px;color:var(--mu);margin-left:2px}.pwb small{font-size:10.5px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pwmix{display:flex;height:8px;border-radius:4px;overflow:hidden;margin-top:12px;background:rgba(var(--ink),.06)}.pwmix i{display:block;height:100%}
.pwmixl{display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:var(--mu)}.pwmixl span{display:flex;align-items:center;gap:5px}.pwmixl i{width:8px;height:8px;border-radius:50%}
.spark.pwspark{margin:18px 0 10px}
.pwgo{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:14px;padding:11px;border-radius:14px;background:rgba(45,212,191,.12);border:1px solid rgba(45,212,191,.4);color:#99f6e4;font-size:13px;font-weight:600}
.pwgo ha-icon{--mdc-icon-size:17px}

/* media server card */
.jfs{display:flex;gap:12px;padding:10px;border-radius:16px;background:linear-gradient(120deg,rgba(167,139,250,.16),rgba(96,165,250,.08));border:1px solid var(--line);cursor:pointer;margin-bottom:8px}
.jfp{flex:none;width:58px;height:84px;border-radius:10px;overflow:hidden;background:rgba(var(--ink),.06);display:grid;place-items:center}.jfp img{width:100%;height:100%;object-fit:cover}.jfp ha-icon{--mdc-icon-size:26px;color:var(--mu)}
.jfi{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;justify-content:center}
.jfi b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.jfi span{font-size:12px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jfi em{font-style:normal;font-size:11px;color:#c4b5fd;display:flex;align-items:center;gap:3px}.jfi em ha-icon{--mdc-icon-size:13px}
.m2 .upbar{display:block;height:4px;margin-top:6px;border-radius:2px;background:rgba(var(--ink),.1);overflow:hidden}
.m2 .upbar>i{display:block;height:100%;border-radius:2px;background:linear-gradient(90deg,var(--teal),var(--blue));transition:width .6s}
.m2 .upbar.ind>i{animation:upind 1.4s ease-in-out infinite} /* no percentage: a moving bar */
@keyframes upind{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
[dir=rtl] .m2 .upbar.ind>i{animation-direction:reverse}
.wrow .uppct{font-size:13px;font-weight:700;color:var(--teal)}
.jfbar{height:4px;border-radius:2px;background:rgba(var(--ink),.08);overflow:hidden;margin-top:4px}.jfbar i{display:block;height:100%;border-radius:2px;background:linear-gradient(90deg,#a78bfa,#60a5fa)}
.mempty{display:flex;align-items:center;gap:8px;padding:12px;border-radius:14px;background:var(--panel2);border:1px dashed var(--line);font-size:12px;color:var(--mu)}.mempty ha-icon{--mdc-icon-size:18px}
.mdl{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.mdl>*{display:flex;flex-direction:column;align-items:center;gap:2px;padding:9px 4px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);cursor:pointer;text-align:center;color:var(--tx);font:inherit;min-width:0}
.mdl ha-icon{--mdc-icon-size:18px;color:var(--mu)}.mdl b{font-size:14px;white-space:nowrap}.mdl b small{font-size:9.5px;color:var(--mu);margin-left:2px;font-weight:600}.mdl span{font-size:10px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.mdl .act ha-icon{color:#60a5fa}.mdl .act.up ha-icon{color:#34d399}.mdl button.on{border-color:rgba(251,191,36,.45);background:rgba(251,191,36,.1)}.mdl button.on ha-icon{color:#fbbf24}
.mq{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.mqr{display:grid;grid-template-columns:18px 1fr auto;align-items:center;gap:4px 8px;padding:8px 10px;border-radius:12px;background:var(--panel2);border:1px solid var(--line);font-size:12px;cursor:pointer}
.mqr ha-icon{--mdc-icon-size:16px;color:#60a5fa}.mqr span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mqr b{font-size:12px;color:#93c5fd}.mqr .jfbar{grid-column:1/-1;margin-top:0}
.mup{display:grid;grid-template-columns:74px 34px 1fr;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;background:var(--panel2);border:1px solid var(--line);margin-bottom:6px;cursor:pointer}
.mud{display:flex;flex-direction:column}.mud b{font-size:12px}.mud span{font-size:10.5px;color:var(--mu)}
.mup>ha-icon{--mdc-icon-size:18px;color:#60a5fa}.mup.mmv>ha-icon{color:#f472b6}
.mut{min-width:0;display:flex;flex-direction:column}.mut b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mut span{font-size:11px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mlib{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px}
.mlib div{display:flex;flex-direction:column;align-items:center;padding:8px 4px;border-radius:12px;background:var(--panel2);border:1px solid var(--line);cursor:pointer}
.mlib ha-icon{--mdc-icon-size:17px;color:var(--mu)}.mlib b{font-size:15px}.mlib span{font-size:10px;color:var(--mu)}.mlib .warn ha-icon,.mlib .warn b{color:#fbbf24}
.mdks{display:flex;flex-direction:column;gap:2px}
.mdk{display:grid;grid-template-columns:18px 70px 1fr auto;align-items:center;gap:8px;font-size:12px;padding:4px 2px;cursor:pointer}
.mdk ha-icon{--mdc-icon-size:16px;color:var(--mu)}.mdk span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mdk b{font-size:11.5px;color:var(--mu);font-weight:600}
.msvs{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.msv{display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:999px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid var(--line);background:var(--panel2);color:var(--mu)}
.msv ha-icon{--mdc-icon-size:14px}.msv::before{content:'';width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 6px #34d399}
.msv.bad{color:var(--rose);border-color:rgba(251,113,133,.45)}.msv.bad::before{background:#f43f5e;box-shadow:0 0 6px #f43f5e}

/* jellyfin library browser */
.mlib div.go{position:relative}.mlib div.go span{color:#c4b5fd}
.jfwait{margin:0 0 12px;padding:12px;border-radius:14px;background:rgba(45,212,191,.08);border:1px solid rgba(45,212,191,.35);font-size:13px}.jfwm{display:flex;gap:10px;align-items:flex-start}.jfwm span{flex:1;line-height:1.4}.jfwm ha-icon{--mdc-icon-size:18px;color:var(--teal)}.jfwait .spin{animation:spin 1s linear infinite}.jfwb{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.jfwb .pill{display:inline-flex;align-items:center;justify-content:center;gap:6px;max-width:none;font-size:13px;line-height:1;padding:9px 16px;cursor:pointer}.jfwb .pill ha-icon{--mdc-icon-size:18px;display:flex}.jfwb .pill.on{background:var(--teal);color:#04342c;border-color:var(--teal)}.jfwh{margin-top:8px;font-size:11px;color:var(--mu)}
.jfgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.jfpo{position:relative;display:flex;flex-direction:column;gap:5px;padding:0;background:none;border:0;color:var(--tx);font:inherit;text-align:start;cursor:pointer;min-width:0}
.jfpo span{font-size:11.5px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.jfimg{position:relative;width:100%;aspect-ratio:2/3;border-radius:12px;overflow:hidden;background:var(--panel2);border:1px solid var(--line);display:grid;place-items:center}
.jfimg ha-icon{--mdc-icon-size:26px;color:var(--mu)}.jfimg img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.jfplayi{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:rgba(15,23,42,.75);font-style:normal}.jfplayi ha-icon{--mdc-icon-size:16px;color:#fff}
.jfpo:active .jfimg{transform:scale(.97)}
.jfback{display:inline-flex;align-items:center;gap:2px;margin:-4px 0 10px;padding:5px 10px 5px 4px;padding-inline:4px 10px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);color:var(--mu);font:inherit;font-size:12px;cursor:pointer}.jfback ha-icon{--mdc-icon-size:18px}
.jfshowh{display:flex;gap:12px;align-items:center;margin-bottom:10px}.jfshowh .jfimg{width:74px;flex:none}
.jfshowh>div:last-child{display:flex;flex-direction:column;gap:3px;min-width:0}.jfshowh b{font-size:15px}.jfshowh span{font-size:12px;color:var(--mu)}.jfshowh em{font-style:normal;font-size:11px;color:#c4b5fd}
.jfseas{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -16px 10px;padding:0 16px}.jfseas::-webkit-scrollbar{display:none}
.jfseas button{flex:none;padding:6px 12px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);color:var(--mu);font:inherit;font-size:12px;cursor:pointer}.jfseas button.on{color:var(--hi);border-color:rgba(167,139,250,.6);background:rgba(167,139,250,.18)}
.jfep{display:flex;align-items:center;gap:10px;width:100%;padding:6px;margin-bottom:6px;border-radius:12px;background:var(--panel2);border:1px solid var(--line);color:var(--tx);font:inherit;text-align:start;cursor:pointer}
.jfep .jfimg{width:96px;flex:none;aspect-ratio:16/9;border-radius:8px}.jfep>div:not(.jfimg){flex:1;min-width:0}.jfep b{font-size:12.5px;font-weight:500;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.jfep .jfepp{--mdc-icon-size:18px;color:#a78bfa;flex:none;margin-right:4px}

/* coming up posters + details */
.mupth{width:34px;height:50px;border-radius:6px;overflow:hidden;background:var(--panel2)}.mupth img{width:100%;height:100%;object-fit:cover;display:block}
.mup>ha-icon{justify-self:center}
.sh-h.mup-h{margin-bottom:0;position:relative;z-index:2}
.muph{position:relative;display:flex;gap:14px;align-items:flex-end;margin:-6px -16px 0;padding:0 16px 12px;min-height:150px}
.mupbg{position:absolute;inset:-46px 0 0;background-size:cover;background-position:center 25%;opacity:.35;-webkit-mask-image:linear-gradient(#000 40%,transparent);mask-image:linear-gradient(#000 40%,transparent);pointer-events:none}
.muppo{position:relative;width:110px;flex:none;box-shadow:0 12px 30px -10px rgba(0,0,0,.8)}
.mupt{position:relative;display:flex;flex-direction:column;gap:4px;min-width:0}.mupt b{font-size:18px;line-height:1.2}.mupt span{font-size:13px;color:#e2e8f0}
.mupt em{font-style:normal;font-size:12px;color:var(--mu);display:flex;align-items:center;gap:5px}.mupt em ha-icon{--mdc-icon-size:15px}
.mupchips{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px}.mupchips span{font-size:11px;padding:4px 9px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);color:#cbd5e1}
.mupov{font-size:13px;line-height:1.5;color:#cbd5e1;margin:0 0 4px}.mupov.mu{color:var(--mu)}

/* energy history grid balance */
.ehbal{margin:2px 0 10px;padding:10px 12px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);cursor:pointer}
.ehbal.exp{border-color:rgba(52,211,153,.4);background:linear-gradient(120deg,rgba(52,211,153,.12),transparent)}.ehbal.imp{border-color:rgba(96,165,250,.4);background:linear-gradient(120deg,rgba(96,165,250,.12),transparent)}
.ehbal-t{display:flex;align-items:center;gap:8px}.ehbal-t ha-icon{--mdc-icon-size:20px}.ehbal.exp .ehbal-t ha-icon,.ehbal.exp .ehbal-t b{color:var(--green)}.ehbal.imp .ehbal-t ha-icon,.ehbal.imp .ehbal-t b{color:#60a5fa}
.ehbal-t span{flex:1;font-size:13px;font-weight:600}.ehbal-t b{font-size:18px}.ehbal-t b small{font-size:11px;margin-left:3px;color:var(--mu);font-weight:600}
.ehbal-bar{display:flex;height:8px;border-radius:4px;overflow:hidden;margin:8px 0 6px;background:rgba(var(--ink),.06);gap:2px}.ehbal-bar i{display:block;height:100%}.ehbal-bar .in{background:#60a5fa}.ehbal-bar .out{background:#34d399}
.ehbal-l{display:flex;justify-content:space-between;font-size:11px;color:var(--mu)}.ehbal-l span{display:flex;align-items:center;gap:3px}.ehbal-l ha-icon{--mdc-icon-size:13px}

/* swap sheet */
.swnode{margin:-4px 0 6px}.swnode .bar,.swn .bar{height:6px;border-radius:3px;background:rgba(var(--ink),.07);overflow:hidden}.swnode .bar i,.swn .bar i{display:block;height:100%;border-radius:3px}
.swr{display:grid;grid-template-columns:16px 18px 1fr auto auto;align-items:center;gap:8px;padding:9px 10px;margin-bottom:6px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);cursor:pointer}
.swr>em{font-style:normal;font-size:11px;color:var(--mu);text-align:center}.swr>ha-icon{--mdc-icon-size:17px;color:#f472b6}
.swn{min-width:0;display:flex;flex-direction:column;gap:3px}.swn b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.swn span{font-size:10.5px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.swr strong{font-size:13px;white-space:nowrap}.swr strong small{font-size:9.5px;color:var(--mu);margin-left:2px}
.swr .rbtn{position:relative}.swnr{width:0}
.rbtn.busy{opacity:.7;background:rgba(148,163,184,.12)!important;border-color:var(--line)!important;color:var(--mu)!important}.rbtn.busy ha-icon{color:var(--mu)!important}
.rbtn.busy .spin{animation:spin 1s linear infinite}
.swnote{display:flex;gap:8px;align-items:flex-start;margin-top:10px;padding:10px;border-radius:12px;border:1px dashed var(--line);font-size:11.5px;color:var(--mu);line-height:1.4}.swnote ha-icon{--mdc-icon-size:16px;flex:none}

/* wanted sheet */
.wtg{margin-bottom:14px}
.wth{position:relative;display:flex;gap:12px;align-items:flex-end;margin:0 -16px 8px;padding:10px 16px 6px;min-height:118px;overflow:hidden}
.wth .mupbg{inset:0}.wth .muppo{width:74px}
.wte{padding:9px 11px;margin-bottom:6px;border-radius:12px;background:var(--panel2);border:1px solid var(--line)}
.wtei{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;align-items:baseline}.wtei b{font-size:12px;color:#fbbf24}.wtei span{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wtei em{grid-column:1/-1;font-style:normal;font-size:11px;color:var(--mu)}
.wte p{margin:6px 0 0;font-size:12px;line-height:1.45;color:#cbd5e1}

/* energy history loading state */
.ehwrap{position:relative}
.ehwrap.ehbusy>*:not(.ehspin){opacity:.35;pointer-events:none;transition:opacity .2s}
.ehspin{position:absolute;left:50%;top:150px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:rgba(15,23,42,.92);border:1px solid var(--line);font-size:12px;color:#e2e8f0;box-shadow:0 10px 30px -10px rgba(0,0,0,.8);white-space:nowrap;z-index:2}
.ehspin ha-icon{--mdc-icon-size:18px;color:var(--teal)}.ehspin .spin{animation:spin 1s linear infinite}
.skl{display:block;height:11px;border-radius:6px;background:linear-gradient(90deg,rgba(var(--ink),.05),rgba(var(--ink),.12),rgba(var(--ink),.05));background-size:200% 100%;animation:skl 1.3s ease-in-out infinite}
.kpis .skl+.skl{margin-top:6px}
@keyframes skl{0%{background-position:100% 0}100%{background-position:-100% 0}}
.ehbal.skel{cursor:default}
.ehchart.skel{display:flex;align-items:flex-end;gap:6px;height:150px;padding-left:30px;margin-bottom:22px}.ehchart.skel i{flex:1;border-radius:3px 3px 0 0;background:rgba(var(--ink),.08);animation:skl 1.3s ease-in-out infinite;background-image:linear-gradient(90deg,rgba(var(--ink),.05),rgba(var(--ink),.12),rgba(var(--ink),.05));background-size:200% 100%}
.cons .crow .skl{width:100%}.crow.skrow{min-height:44px;cursor:default}

/* loading placeholders */
.spk-load{position:relative}.spk-load .ehspin{top:46px}
.spk.skelchart{display:flex;align-items:flex-end;gap:3px;cursor:default}.spk.skelchart i{flex:1;border-radius:2px 2px 0 0;background:linear-gradient(90deg,rgba(var(--ink),.05),rgba(var(--ink),.12),rgba(var(--ink),.05));background-size:200% 100%;animation:skl 1.3s ease-in-out infinite}
.mupskel{position:relative}.mupskel .ehspin{top:120px}.mupskel .mup{cursor:default}.mupth.skl{display:block;width:34px;height:50px;border-radius:6px}
.wxskh{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;text-align:center}.wxskh>div{display:flex;flex-direction:column;align-items:center}
.jfimg.skl{border:0;height:auto}.muppo.skl{height:auto;aspect-ratio:2/3}.wth .mupt{flex:1}

/* energy history: back to the current period */
.ehnow.hide{visibility:hidden;pointer-events:none}
.ehnow{display:inline-flex;align-items:center;gap:4px;margin-right:4px;padding:6px 11px;border-radius:999px;background:rgba(45,212,191,.14);border:1px solid rgba(45,212,191,.45);color:#99f6e4;font:inherit;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
.ehnow ha-icon{--mdc-icon-size:15px}

/* tiles */
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.tiles.two{grid-template-columns:1fr 1fr}
.tile{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:11px;border-radius:16px;background:var(--panel2);border:1px solid var(--line);font-size:12px;font-weight:500;color:var(--mu);transition:.2s;text-align:start;min-width:0}
.tile span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.tile ha-icon{--mdc-icon-size:20px}
@media (hover:hover){.tile:hover{background:rgba(var(--ink),.08)}}
.tile.on{color:var(--hi);background:linear-gradient(135deg,rgba(45,212,191,.28),rgba(96,165,250,.14));border-color:rgba(45,212,191,.45)}.tile.on ha-icon{color:var(--teal)}
.tile.on.red{background:linear-gradient(135deg,rgba(244,63,94,.3),rgba(244,63,94,.1));border-color:rgba(251,113,133,.5)}.tile.on.red ha-icon{color:var(--rose)}
.tile em.sub{font-style:normal;font-size:10.5px;color:var(--mu)}.ptime{font-variant-numeric:tabular-nums}
.tile.wide{flex-direction:row;align-items:center;flex-wrap:wrap}.tile.wide span{flex:1}.tile.wide em.sub{width:100%;padding-left:28px;margin-top:-4px}

/* stage */
.stage{display:flex;flex-direction:column;padding:14px}
.stage-top{display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.title{display:flex;align-items:center;gap:10px;flex:1;min-width:160px}
.title>ha-icon{--mdc-icon-size:24px;color:#fff;background:linear-gradient(135deg,#6366f1,#14b8a6);padding:8px;border-radius:14px;box-shadow:0 8px 24px -6px #6366f1}
.title div{display:flex;flex-direction:column}.title b{font-size:17px}.title span{font-size:12px;color:var(--mu)}
.seg{display:flex;padding:4px;border-radius:14px;background:rgba(0,0,0,.25);border:1px solid var(--line)}
.seg button{display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:10px;font-size:12.5px;color:var(--mu);transition:.2s}
.seg button ha-icon{--mdc-icon-size:17px}
.seg button.on{background:rgba(var(--ink),.1);color:var(--hi);box-shadow:0 2px 10px rgba(0,0,0,.3)}
.tools{display:flex;gap:6px}
.viewport{--day:.6;position:relative;flex:none;width:100%;height:clamp(440px,calc(100vh - 280px),900px);border-radius:18px;overflow:hidden;
  background:radial-gradient(120% 90% at 50% 0%,color-mix(in srgb,#1e3a8a calc(var(--day)*100%),#0b1020) 0%,#070b16 70%);border:1px solid var(--line)}
.viewport canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none}
.labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.lbl{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;display:flex;align-items:center;gap:6px;padding:5px 9px;border-radius:12px;background:rgba(var(--s1),.72);border:1px solid rgba(var(--ink),.12);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-size:11.5px;white-space:nowrap;box-shadow:0 6px 20px rgba(0,0,0,.4);transition:border-color .3s,background .3s;will-change:transform}
.lbl::after{content:'';position:absolute;left:50%;bottom:-5px;width:8px;height:8px;background:inherit;border-right:1px solid rgba(var(--ink),.12);border-bottom:1px solid rgba(var(--ink),.12);transform:translateX(-50%) rotate(45deg)}
.lbl b{font-weight:600}.lbl .t{font-weight:700}.lbl .h{color:var(--blue);font-size:10.5px}
.lbl .ics{display:flex;gap:2px}.lbl ha-icon{--mdc-icon-size:14px;color:var(--amber)}.lbl ha-icon.ac{color:var(--blue)}.lbl ha-icon.mo{color:var(--teal)}.lbl ha-icon.lplug{color:var(--blue)}
.lbl.lit{border-color:rgba(251,191,36,.55);box-shadow:0 0 22px -6px rgba(251,191,36,.7)}
.lbl.mo{border-color:rgba(45,212,191,.6)}
.lbl.sel{background:rgba(45,212,191,.25);border-color:var(--teal)}
.lbl.nodata{opacity:.75;font-size:10.5px}
.legend{position:absolute;left:12px;bottom:12px;display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:10px;background:rgba(var(--s1),.65);font-size:11px;color:var(--mu);pointer-events:none}
.lg-bar{width:120px;height:6px;border-radius:3px;background:linear-gradient(90deg,#3b82f6,#22d3ee,#34d399,#fbbf24,#f43f5e)}
.legend:has(.lg-bar){flex-direction:column;align-items:stretch;gap:3px}.lg-lbl{display:flex;justify-content:space-between;font-size:10px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex:none}
.dot.amber{background:var(--amber);box-shadow:0 0 8px var(--amber)}.dot.gray{background:#475569}.dot.teal{background:var(--teal)}.dot.green{background:var(--green);box-shadow:0 0 6px var(--green)}.dot.red{background:var(--rose)}
.pulse{animation:pulse 1.4s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(45,212,191,.7)}100%{box-shadow:0 0 0 10px rgba(45,212,191,0)}}
.loading.noroom{padding:24px;text-align:center;gap:8px}.loading.noroom ha-icon{--mdc-icon-size:40px;color:var(--teal)}.loading.noroom b{color:var(--tx);font-size:16px}.loading.noroom span{max-width:420px;line-height:1.5}
.loading{position:absolute;inset:0;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;color:var(--mu);font-size:13px;transition:opacity .6s}
.loading.gone,.hint.gone{opacity:0;pointer-events:none}
.spinner{width:34px;height:34px;border-radius:50%;border:3px solid rgba(var(--ink),.1);border-top-color:var(--teal);animation:spin 1s linear infinite}
.drawer{position:absolute;top:12px;right:12px;bottom:12px;width:290px;max-width:calc(100% - 24px);padding:16px;border-radius:18px;background:rgba(var(--s2),.82);border:1px solid rgba(var(--ink),.12);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);transform:translateX(calc(100% + 20px));transition:transform .35s cubic-bezier(.2,.8,.2,1);overflow:auto;box-shadow:-20px 0 50px -20px rgba(0,0,0,.6)}
.drawer.open{transform:none}
.dh{display:flex;align-items:center;gap:10px;margin:-16px -16px 14px;padding:20px 16px 10px;position:sticky;top:-16px;z-index:3;background:rgba(var(--s2),.9);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:18px 18px 0 0;touch-action:none;cursor:grab}
.dh::before{content:'';position:absolute;top:7px;left:50%;width:38px;height:4px;border-radius:2px;background:rgba(var(--ink),.28);transform:translateX(-50%)}
.drawer{overscroll-behavior:contain}
@media (pointer:coarse){.dh>[data-act=close]{display:none}}.dh>ha-icon{color:var(--teal)}.dh h3{flex:1;margin:0;font-size:16px}
.dstats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.dstats div{padding:12px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);cursor:pointer;display:flex;flex-direction:column}
.dstats b{font-size:26px;font-weight:700;letter-spacing:-1px}.dstats span{font-size:11px;color:var(--mu)}
.dac{border-radius:14px;background:var(--panel2);border:1px solid var(--line);margin-bottom:12px;overflow:hidden;transition:border-color .25s}
.dac.on{border-color:color-mix(in srgb,var(--c) 50%,transparent);background:color-mix(in srgb,var(--c) 12%,transparent)}
.dac-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;cursor:pointer}
.dac-l{display:flex;align-items:center;gap:8px;font-size:12px;min-width:0}.dac-l span{color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dac .tgt.sm{gap:6px}.dac .ibtn{width:30px;height:30px}.dac .pow{width:30px;height:30px}
.dac-chev{--mdc-icon-size:18px;color:var(--mu);margin-left:2px}
.dac.open .acctl{padding-top:2px;border-top:1px solid var(--line)}
.blbl{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;display:flex;align-items:center;gap:4px;padding:3px 8px 3px 6px;padding-inline:6px 8px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap;background:rgba(var(--s1),.72);border:1px solid rgba(52,211,153,.5);color:var(--tx);backdrop-filter:blur(6px);will-change:transform}
.blbl ha-icon{--mdc-icon-size:13px;color:var(--green)}.blbl.unl{border-color:rgba(251,113,133,.7)}.blbl.unl ha-icon{color:var(--rose)}.blbl.na{border-color:var(--line)}.blbl.na ha-icon{color:var(--mu)}
.blbl button{display:inline-flex;margin-inline-start:2px;color:var(--mu)}.blbl button ha-icon{color:inherit}
.fb{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;width:10px;height:10px;border-radius:50%;background:rgba(148,163,184,.85);border:2px solid rgba(var(--s1),.8);box-shadow:0 2px 8px rgba(0,0,0,.5);display:grid;place-items:center;will-change:transform;transition:width .2s,height .2s,background .2s}
.fb::before{content:'';position:absolute;inset:-12px;border-radius:50%} /* a bigger tap area than the dot */
.fb.big{width:26px;height:26px;background:rgba(var(--s1),.8);border:1px solid rgba(var(--ink),.18)}.fb ha-icon{--mdc-icon-size:15px;color:var(--mu)}
.fb.on{background:var(--amber);box-shadow:0 0 12px -2px var(--amber)}.fb.on.big{background:rgba(251,191,36,.22);border-color:rgba(251,191,36,.7)}.fb.on ha-icon{color:var(--amber)}
.fb.na{background:var(--rose)}.fb.na.big{background:rgba(244,63,94,.18);border-color:rgba(251,113,133,.6)}.fb.na ha-icon{color:var(--rose)}
[dir=rtl] .drawer{right:auto;left:12px;transform:translateX(calc(-100% - 20px));box-shadow:20px 0 50px -20px rgba(0,0,0,.6)}[dir=rtl] .drawer.open{transform:none}
[dir=rtl] .lvls{right:auto;left:12px}[dir=rtl] .legend{left:auto;right:12px}[dir=rtl] .lrow,[dir=rtl] .mrow{text-align:right}
[dir=rtl] #cv,[dir=rtl] .labels{direction:ltr}[dir=rtl] .lbl,[dir=rtl] .fb{direction:rtl}
[dir=rtl]{font-family:'Noto Kufi Arabic','SF Arabic','Noto Sans Arabic','Segoe UI',Tahoma,system-ui,sans-serif}
.rback{display:none} /* only on phones (below) */
.lvls{position:absolute;right:12px;bottom:12px;display:flex;flex-direction:column;gap:4px;padding:4px;border-radius:14px;background:rgba(var(--s1),.72);border:1px solid rgba(var(--ink),.1);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:1}
.lvls button{display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:10px;font-size:12px;font-weight:600;color:var(--mu);min-height:36px}
.lvls button.on{background:rgba(45,212,191,.2);color:var(--teal)}.lvls ha-icon{--mdc-icon-size:16px}
.viewport:has(.drawer.open) .lvls{display:none}
@media (pointer:coarse){.lvls button{min-height:44px}}
.hint{position:absolute;left:50%;top:12px;transform:translate(-50%,-8px);max-width:min(460px,calc(100% - 24px));display:none;align-items:center;gap:8px;padding:8px 6px 8px 12px;padding-inline:12px 6px;border-radius:14px;background:rgba(var(--s1),.85);border:1px solid rgba(45,212,191,.45);font-size:12.5px;line-height:1.35;box-shadow:0 10px 30px -10px rgba(0,0,0,.6);z-index:2;opacity:0;transition:opacity .4s,transform .4s}
.hint.on{display:flex;opacity:1;transform:translate(-50%,0)}.hint>ha-icon{color:var(--teal);flex:none}.hint span{flex:1}.hint .ibtn{flex:none;width:32px;height:32px}
.ch .rnbtn{flex:none}.rnsave{width:100%;display:flex;justify-content:center;gap:8px;margin-top:10px}.rnsave span{flex:none}
.rnrow{display:grid;grid-template-columns:auto 1fr;align-items:center;column-gap:10px;padding:8px 10px;border-radius:12px;background:var(--panel2);border:1px solid var(--line);margin-bottom:6px}
.rnrow ha-icon{color:var(--mu);grid-row:span 2}.rnrow small{grid-column:2;font-size:10.5px;color:var(--mu);margin:2px 0 0;opacity:.8}
.rnrow input{font:inherit;font-size:13px;color:var(--tx);background:rgba(var(--ink),.05);border:1px solid var(--line);border-radius:8px;padding:7px 9px;min-width:0;width:100%}
.rnrow input:focus{outline:none;border-color:var(--teal);background:rgba(45,212,191,.08)}.rnrow.na{opacity:.6}
.wents{margin-top:12px}
:host(:not([editing])) .edit-only{display:none!important}
.hbtn{flex:none;display:grid;place-items:center;width:32px;height:32px;margin:-6px -6px -6px 2px;border-radius:9px;color:var(--mu);opacity:.65}
@media (hover:hover){.hbtn:hover{opacity:1;background:rgba(var(--ink),.08)}}.hbtn ha-icon{--mdc-icon-size:17px}.hbtn.confirm{opacity:1;color:var(--rose);background:rgba(244,63,94,.15);position:relative}
.hbtn.confirm::after{left:auto;right:0;transform:none} /* the tip sits over the eye button, kept inside the card at the right edge */
@media (pointer:coarse){.hbtn{width:40px;height:40px}}
.fgrp{border-radius:14px;margin-bottom:8px}.fgrp .lrow:last-child,.fgrp .mrow:last-child{margin-bottom:0}
.fhd{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--mu);margin:2px 2px 6px}.fhd ha-icon{--mdc-icon-size:16px}
.fgrp.focus{padding:10px;background:rgba(45,212,191,.08);border:1px solid rgba(45,212,191,.45);margin-bottom:12px}.fgrp.focus .fhd{color:var(--tx);font-size:13px}.fgrp.focus .fhd ha-icon{color:var(--teal)}
.dfold{display:flex;align-items:center;justify-content:center;gap:4px;width:100%;padding:8px;margin-bottom:6px;border-radius:10px;font-size:12px;color:var(--mu);border:1px dashed var(--line)}
.mrow.na{opacity:.6}.mrow.na b{color:var(--rose)}
@media (pointer:coarse){.lrow,.mrow{min-height:48px;padding:12px 14px;font-size:13.5px}.dfold{min-height:44px}.lbl{padding:7px 11px;font-size:12.5px}.drawer .ibtn{min-width:44px;min-height:44px}.fb.big{width:32px;height:32px}}
.dsec{font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:var(--mu);margin:12px 0 6px}
.lrow,.mrow{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border-radius:12px;background:var(--panel2);border:1px solid var(--line);margin-bottom:6px;font-size:12.5px;text-align:start;cursor:pointer}
.lrow span,.mrow span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lrow b,.mrow b{font-size:11.5px;color:var(--mu);font-weight:600}
.lrow ha-icon,.mrow ha-icon{color:var(--mu)}
.lrow.on{background:linear-gradient(100deg,rgba(251,191,36,.25),rgba(251,191,36,.05));border-color:rgba(251,191,36,.5)}.lrow.on ha-icon{color:var(--amber);filter:drop-shadow(0 0 6px var(--amber))}.lrow.on b{color:var(--amber)}
.lrow.on.cool{background:linear-gradient(100deg,rgba(96,165,250,.25),transparent);border-color:rgba(96,165,250,.5)}.lrow.on.cool ha-icon{color:var(--blue);filter:none}
.mrow .m2 small{display:block;font-size:10.5px;color:var(--mu);margin-top:1px;font-weight:400}.mrow.on .m2 small{color:color-mix(in srgb,var(--teal) 70%,var(--mu))}
.mrow.on{border-color:rgba(45,212,191,.5);background:rgba(45,212,191,.12)}.mrow.on ha-icon,.mrow.on b{color:var(--teal)}
ha-icon.spin{animation:spin 1.2s linear infinite}
.empty{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--mu);padding:10px}
.roomstrip{display:flex;gap:8px;margin-top:12px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin}
.rchip{display:flex;align-items:center;gap:7px;padding:8px 12px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);font-size:12px;white-space:nowrap;flex:none;transition:.2s}
.rchip ha-icon{--mdc-icon-size:16px;color:var(--mu)}.rchip b{font-size:12px}
.rchip.lit{border-color:rgba(251,191,36,.35)}.rchip.lit ha-icon{color:var(--amber)}
.rchip.sel{background:rgba(45,212,191,.18);border-color:var(--teal)}

/* energy */
.flow{position:relative;height:170px;width:300px;max-width:100%;margin:-4px auto 8px}
.flowsvg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.fl{fill:none;stroke:rgba(var(--ink),.08);stroke-width:3;stroke-linecap:round}
.fl.act{stroke-dasharray:2 12;stroke-width:4;animation:dash 1s linear infinite}
.fl.act.sun{stroke:#fbbf24;filter:drop-shadow(0 0 4px #fbbf24)}.fl.act.grid{stroke:#60a5fa;filter:drop-shadow(0 0 4px #60a5fa)}.fl.act.exp{stroke:#34d399;filter:drop-shadow(0 0 4px #34d399)}
.fl.act.dev{stroke:#a78bfa;stroke-width:3;filter:drop-shadow(0 0 3px #a78bfa)}
.n-dev{top:212px;width:92px;transform:translateX(-50%)}.n-dev ha-icon{--mdc-icon-size:18px;width:36px;height:36px;background:rgba(167,139,250,.14);color:#c4b5fd}
.n-dev b{font-size:13px}.n-dev span{max-width:92px;overflow:hidden;text-overflow:ellipsis}
.fl.s1{animation-duration:.45s}.fl.s2{animation-duration:.8s}.fl.s3{animation-duration:1.4s}.fl.s4{animation-duration:2.2s}
@keyframes dash{to{stroke-dashoffset:-28}}
.node{position:absolute;display:flex;flex-direction:column;align-items:center;width:96px;cursor:pointer;line-height:1.15}
.node ha-icon{--mdc-icon-size:24px;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;margin-bottom:4px}
.node b{font-size:15px;font-weight:700}.node span{font-size:10.5px;color:var(--mu);white-space:nowrap}
.n-sun{left:50%;top:-4px;transform:translateX(-50%)}.n-sun ha-icon{background:rgba(251,191,36,.16);color:var(--amber)}
.n-grid{left:6px;top:96px}.n-grid ha-icon{background:rgba(96,165,250,.16);color:var(--blue)}.n-grid.exp ha-icon{background:rgba(52,211,153,.18);color:var(--green)}
.n-home{right:6px;top:96px}.n-home ha-icon{background:rgba(167,139,250,.18);color:var(--violet)}
/* the glow: power flowing through the bubble (none at 0 W) */
.node ha-icon{transition:box-shadow .4s}
.n-sun.on ha-icon{box-shadow:0 0 24px -6px var(--amber)}
.n-grid.on ha-icon{box-shadow:0 0 24px -6px var(--blue)}.n-grid.exp.on ha-icon{box-shadow:0 0 24px -6px var(--green)}
.n-home.on ha-icon{box-shadow:0 0 24px -6px var(--violet)}
.n-dev.on ha-icon{box-shadow:0 0 18px -7px var(--violet)}
.spark{margin:26px 0 12px;min-height:150px}
.spk-wrap{display:grid;grid-template-columns:max-content 1fr;column-gap:6px;grid-template-rows:120px 16px}
.spk-y{position:relative;font-size:9.5px;font-variant-numeric:tabular-nums}.spk-y i{display:block;visibility:hidden;height:0;font-style:normal}.spk-y::before{content:'kW';position:absolute;top:-15px;left:0;font-size:9px;color:var(--mu);opacity:.7}.spk-y span{position:absolute;right:0;transform:translateY(-50%);line-height:1;color:var(--mu)}
.spk{position:relative;touch-action:pan-y;cursor:crosshair}.spk svg{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:visible}
.spk-g line{stroke:rgba(var(--ink),.07);stroke-width:1;vector-effect:non-scaling-stroke}.spk-g line.z{stroke:rgba(var(--ink),.28)}
.spk-v{stroke:rgba(var(--ink),.05);stroke-width:1;vector-effect:non-scaling-stroke}
.spk-now{stroke:rgba(45,212,191,.7);stroke-width:1;stroke-dasharray:3 3;vector-effect:non-scaling-stroke}
.spk-x{grid-column:2;position:relative}.spk-x span{position:absolute;top:3px;transform:translateX(-50%);font-size:9.5px;color:var(--mu)}.spk-x span:first-child{transform:none}.spk-x span:last-child{transform:translateX(-100%)}
.spk-pk{position:absolute;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px rgba(var(--ink),.18);pointer-events:none}
.spk-pk em{position:absolute;bottom:9px;left:50%;transform:translateX(-50%);font-style:normal;font-size:9.5px;font-weight:700;white-space:nowrap;color:#fff;background:rgba(var(--s1),.75);padding:1px 5px;border-radius:6px}
.spk-cur{position:absolute;top:0;bottom:0;width:1px;background:rgba(var(--ink),.55);pointer-events:none}
.spk-tip{position:absolute;top:2px;margin-left:8px;padding:6px 8px;border-radius:10px;background:rgba(var(--s1),.92);border:1px solid var(--line);font-size:10.5px;display:flex;flex-direction:column;gap:2px;white-space:nowrap;pointer-events:none;z-index:2}
.spk-tip.l{transform:translateX(-100%);margin-left:-8px}.spk-tip b{font-size:11px}.spk-tip span{display:flex;align-items:center;gap:5px;color:var(--mu)}.spk-tip i{width:8px;height:8px;border-radius:2px}
.sk-lg i.dash,.spk-tip i.dash{background:none!important;border-top:2px dashed #e7ecf6;height:0;width:12px;border-radius:0}
.sk-lg button{display:flex;align-items:center;gap:4px;font-size:10px;color:var(--mu);padding:2px 0}.sk-lg button.off{opacity:.35;text-decoration:line-through}
.ehtop{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.ehseg button{padding:6px 11px}
.ehnav{display:flex;align-items:center;gap:6px}.ehnav b{font-size:13px;min-width:92px;text-align:center}.ehnav .ibtn{width:32px;height:32px}.ehnav .ibtn[disabled]{opacity:.3;pointer-events:none}
.kpis.four{grid-template-columns:repeat(4,1fr)}.kpis.one{grid-template-columns:1fr}.kpis b.amber{color:var(--amber)}.kpis b.green{color:var(--green)}
.ehread{font-size:11.5px;margin:2px 0 6px;min-height:16px;line-height:1.5}.ehread.mu{color:var(--mu)}
.ehchart{position:relative;padding-left:30px}.ehchart svg{display:block;width:100%;height:150px;overflow:visible}
.ehchart .gl{stroke:rgba(var(--ink),.08);stroke-width:1;vector-effect:non-scaling-stroke}
.ehchart .hit{fill:transparent;cursor:pointer}.ehchart g.sel rect:not(.hit){filter:brightness(1.35)}.ehchart g.sel .hit{fill:rgba(var(--ink),.07)}
.ehy{position:absolute;left:0;top:0;height:150px;width:26px}.ehy i{position:absolute;right:0;transform:translateY(-50%);font-style:normal;font-size:9.5px;color:var(--mu)}
.ehx{display:grid;margin-top:4px}.ehx i{font-style:normal;font-size:9.5px;color:var(--mu);text-align:center;white-space:nowrap;overflow:visible}
.ehlg{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 2px}.ehlg .lg{display:flex;align-items:center;gap:5px;font-size:11px;padding:4px 9px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);cursor:pointer}
.ehlg .lg i{width:9px;height:9px;border-radius:3px}.ehlg .rst{color:var(--teal)}.ehlg .rst ha-icon{--mdc-icon-size:13px}
.crow.ehrow{grid-template-columns:20px minmax(70px,110px) 1fr 52px 34px;padding:5px 6px;border-radius:10px;border:1px solid transparent}
.crow.ehrow em{font-style:normal;font-size:10.5px;color:var(--mu);text-align:right}
.crow.ehrow.on{background:color-mix(in srgb,var(--c) 12%,transparent);border-color:color-mix(in srgb,var(--c) 45%,transparent)}.crow.ehrow.on ha-icon{color:var(--c)}
.crow.untr{cursor:default}.eh-msg{padding:40px 0;text-align:center}
.sk-lg{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:10px;color:var(--mu);margin:6px 0 0}.sk-lg span{display:flex;align-items:center;gap:4px}.sk-lg span:last-child{margin-left:auto}.sk-lg i{width:8px;height:8px;border-radius:2px}
.sk-empty{font-size:11px;color:var(--mu);padding:20px 0;text-align:center}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px}
.kpis div{padding:9px 10px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);display:flex;flex-direction:column;cursor:pointer;min-width:0}
.kpis span{font-size:10.5px;color:var(--mu)}.kpis b{font-size:15px;font-weight:700;white-space:nowrap}.kpis em{font-style:normal;font-size:11px;color:var(--green)}
.kpis.small b{font-size:12.5px}
.pill.pillsw{display:inline-flex;align-items:center;gap:4px;cursor:pointer;font:inherit;font-size:11px;font-weight:600}.pill.pillsw ha-icon{--mdc-icon-size:16px}
.pill.tankpill{display:inline-flex;align-items:center;gap:3px;cursor:pointer;white-space:nowrap}.pill.tankpill ha-icon{--mdc-icon-size:13px}
.kpis.e4 div{padding:8px 8px}.kpis.e4 b{white-space:normal;line-height:1.15}.kpis.e4 b small{white-space:nowrap}
.cons{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.crow{display:grid;grid-template-columns:20px 84px 1fr 62px;align-items:center;gap:8px;font-size:12px;cursor:pointer}
.crow ha-icon{--mdc-icon-size:16px;color:var(--mu)}.crow span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.crow b{text-align:right;font-size:12px}
.bar{height:6px;border-radius:3px;background:rgba(var(--ink),.06);overflow:hidden}.bar i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#8b5cf6,#22d3ee);transition:width .6s}

/* water */
.water{display:flex;gap:12px}
.tank{position:relative;width:104px;flex:none;height:180px;border-radius:22px;background:rgba(var(--ink),.04);border:1px solid var(--line);overflow:hidden;cursor:pointer}
.liquid{position:absolute;left:0;right:0;bottom:0;height:var(--lvl);background:linear-gradient(180deg,color-mix(in srgb,var(--c) 75%,transparent),color-mix(in srgb,var(--c) 35%,#0b1222));transition:height 1s}
.wave{position:absolute;left:0;top:-9px;width:200%;height:10px;fill:color-mix(in srgb,var(--c) 75%,transparent);animation:wave 3s linear infinite}
@keyframes wave{to{transform:translateX(-50%)}}
.tank-lbl{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,.6)}
.tank-lbl b{font-size:26px;font-weight:800}.tank-lbl span{font-size:10px;color:#dbeafe;padding:0 6px}
.wtiles{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0}
.wtiles .tile{padding:8px 10px}
ha-icon.pulse{animation:none;color:var(--teal)}

/* car */
.csoc{margin-top:8px;cursor:pointer;min-width:110px}.csoc .bar{height:6px;border-radius:3px;background:rgba(var(--ink),.08);overflow:hidden}.csoc .bar i{display:block;height:100%;border-radius:3px}
.csoc em{display:block;font-style:normal;font-size:11.5px;color:var(--mu);margin-top:4px}
.carviz{position:relative;display:flex;align-items:center;gap:8px;margin-bottom:10px;cursor:pointer}
.carviz svg{width:62%;max-width:270px;flex:none;overflow:visible}
.carviz .body{fill:url(#cbody);stroke:rgba(var(--ink),.32);stroke-width:.9;transition:stroke .3s}
.carviz .glass{fill:url(#cglass);stroke:none}.carviz .pillar{fill:#07090c}.carviz .cpil{fill:#52575e}
.carviz .chrome{fill:none;stroke:#cfd5dc;stroke-width:.8;stroke-linejoin:round;opacity:.85}
.carviz .rail{fill:none;stroke:#c6ccd4;stroke-width:1.5;stroke-linecap:round}.carviz .rail.feet{stroke-width:1.2}
.carviz .spoiler{fill:#2a2e33}.carviz .clad{fill:#0a0b0d}
.carviz .accent{fill:none;stroke:#38bdf8;stroke-width:1.3;stroke-linecap:round;filter:drop-shadow(0 0 2px rgba(56,189,248,.9))}
.carviz .tail{fill:#ef4444;filter:drop-shadow(0 0 2.5px rgba(239,68,68,.9))}.carviz .head{fill:#e0f2fe;filter:drop-shadow(0 0 2.5px rgba(224,242,254,.9))}.carviz .drl{fill:#f1f5f9;opacity:.9}
.carviz .line{fill:none;stroke:rgba(var(--ink),.18);stroke-width:.7}.carviz .handle{fill:rgba(var(--ink),.32)}.carviz .mirror{fill:#3e4248;stroke:rgba(var(--ink),.3);stroke-width:.6}
.carviz .tire{fill:#040506;stroke:#1f2937;stroke-width:1.4}.carviz .rim{fill:#30353d}.carviz .lip{fill:none;stroke:#aab2bd;stroke-width:.7}.carviz .spoke{stroke:#d7dde4;stroke-width:1.4;stroke-linecap:round}.carviz .hub{fill:#15181c;stroke:#c7cdd5;stroke-width:.8}
.carviz .cbar{fill:rgba(var(--ink),.08)}.carviz .cbarf{fill:url(#cg)}
.car.charging .cbarf{animation:charge 2s ease-in-out infinite}.car.charging .body{stroke:var(--green);filter:drop-shadow(0 0 6px rgba(52,211,153,.5))}
@keyframes charge{0%{width:0}100%{width:64px}}
.cpow{display:flex;flex-direction:column}.cpow b{font-size:22px;font-weight:700}.cpow span{font-size:11px;color:var(--mu)}

/* bottom */
.camgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.cam{position:relative;aspect-ratio:16/9;border-radius:16px;overflow:hidden;background:#0b1222 linear-gradient(135deg,#0f172a,#111827);cursor:pointer;border:1px solid var(--line)}
.cam img{width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .5s}.cam img.ok{opacity:1}
.camlive{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.camlive>*{display:block;width:100%;height:100%;--ha-card-border-radius:0;--ha-card-border-width:0;--ha-card-box-shadow:none;--ha-card-background:transparent}
.camlive>img{object-fit:cover}
.cam-ov{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:9px;background:linear-gradient(180deg,rgba(0,0,0,.45),transparent 35%,transparent 55%,rgba(0,0,0,.75))}
.cam-top{display:flex;justify-content:space-between;align-items:center}
.live{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:700;letter-spacing:1px;padding:3px 7px;border-radius:6px;background:rgba(0,0,0,.45)}
.live i{width:7px;height:7px;border-radius:50%;background:var(--green)}.live.mo{background:rgba(244,63,94,.85)}.live.mo i{background:#fff;animation:blink .8s infinite}
.tags{display:flex;gap:4px}.tag{display:flex;align-items:center;gap:3px;font-style:normal;font-size:10px;font-weight:600;padding:3px 7px;border-radius:6px}
.tag ha-icon{--mdc-icon-size:12px}.tag.p{background:rgba(251,191,36,.9);color:#111}.tag.c{background:rgba(96,165,250,.9);color:#0b1222}.tag.d{background:rgba(244,63,94,.92);color:#fff}
.cam-bot{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.cam-bot b{font-size:13px;margin-right:auto}
.cam-bot span{display:flex;align-items:center;gap:3px;font-size:10.5px;color:#e2e8f0;background:rgba(0,0,0,.45);padding:2px 6px;border-radius:6px}.cam-bot span ha-icon{--mdc-icon-size:12px}
.relay{position:relative;display:flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:5px 10px;border-radius:8px;background:rgba(45,212,191,.85);color:#0b1222}.relay ha-icon{--mdc-icon-size:14px}
.np{display:flex;gap:12px;align-items:center;padding:10px;border-radius:16px;background:linear-gradient(120deg,rgba(236,72,153,.16),rgba(139,92,246,.1));border:1px solid var(--line);cursor:pointer;margin-bottom:10px}
.art{width:56px;height:56px;border-radius:14px;flex:none;overflow:hidden;display:grid;place-items:center;background:rgba(0,0,0,.3)}.art img{width:100%;height:100%;object-fit:cover}.art ha-icon{--mdc-icon-size:30px;color:#f43f5e}
.npt{min-width:0;flex:1;display:flex;flex-direction:column}.npt b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.npt span{font-size:11.5px;color:var(--mu)}
.eq{display:flex;gap:3px;align-items:flex-end;height:14px;margin-top:5px}.eq i{width:3px;height:3px;border-radius:2px;background:#f472b6}
.np.playing .eq i{animation:eq .9s ease-in-out infinite alternate}.np.playing .eq i:nth-child(2){animation-delay:-.3s}.np.playing .eq i:nth-child(3){animation-delay:-.6s}.np.playing .eq i:nth-child(4){animation-delay:-.15s}
@keyframes eq{from{height:3px}to{height:14px}}
.mctl{display:flex;justify-content:center;align-items:center;gap:8px;margin-bottom:12px}
.yt{padding:10px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);margin-bottom:8px}
.ytl{display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:8px}.ytl ha-icon{color:#ef4444}.ytl span{flex:1;color:var(--mu)}
.yt .bar{margin-bottom:10px}
.sel{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;padding:5px 10px;border-radius:999px;background:rgba(var(--ink),.06);border:1px solid var(--line);color:var(--mu)}.sel b{color:var(--hi)}.sel ha-icon{--mdc-icon-size:15px}
.sel.on{border-color:rgba(52,211,153,.5);background:rgba(52,211,153,.14)}
.mini{display:flex;align-items:center;gap:8px;font-size:12px;padding:6px 4px;cursor:pointer}.mini span{flex:1;color:var(--mu)}.mini ha-icon{--mdc-icon-size:16px;color:var(--mu)}.mini b{font-size:11px;text-transform:capitalize}
.stats3{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}
.stats3 div{display:flex;flex-direction:column;align-items:center;padding:8px 4px;border-radius:12px;background:var(--panel2);border:1px solid var(--line);cursor:pointer;text-align:center}
.stats3 ha-icon{--mdc-icon-size:17px;color:var(--mu)}.stats3 b{font-size:13px}.stats3 span{font-size:10px;color:var(--mu)}
.rings{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.ring{position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer}
.ring svg{width:84px;height:84px;transform:rotate(-90deg);overflow:visible} /* let the glow spill past the SVG box */.rb{fill:none;stroke:rgba(var(--ink),.07);stroke-width:6}.rf{fill:none;stroke-width:6;stroke-linecap:round;transition:stroke-dashoffset 1s;filter:drop-shadow(0 0 4px currentColor)}
.ring b{position:absolute;top:0;left:0;right:0;height:84px;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;pointer-events:none}.ring b small{font-size:10px;font-weight:600;color:var(--mu);margin-left:1px} /* number + % centred together */.ring span{font-size:11px;color:var(--mu);margin-top:-2px}
.rings.r4{grid-template-columns:repeat(4,1fr);gap:2px}.r4 .ring svg{width:68px;height:68px}.r4 .ring b{height:68px;font-size:15px}
.stats3.s4{grid-template-columns:repeat(4,1fr)}.s4 div[style] ha-icon{color:#fbbf24}
.vms{display:flex;flex-direction:column;gap:5px;margin-top:10px}
.vm{display:grid;grid-template-columns:20px 1fr 10px 64px 60px;align-items:center;gap:8px;font-size:12px;padding:6px 8px;border-radius:10px;background:var(--panel2);cursor:pointer}
.vm ha-icon{--mdc-icon-size:16px;color:var(--violet)}.vm span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vm.off{opacity:.55}
.vmg{display:flex;align-items:center;justify-content:center;width:28px;height:26px;margin:-4px -4px -4px -6px;cursor:grab;touch-action:none;color:var(--mu)}.vmg ha-icon{color:var(--mu)!important}.vm.drag{outline:2px solid var(--teal);background:color-mix(in srgb,var(--teal) 14%,var(--panel2));cursor:grabbing;position:relative;z-index:1}
.vmmore{display:flex;align-items:center;justify-content:center;gap:4px;padding:7px;border-radius:10px;background:none;border:1px dashed var(--line);color:var(--mu);font:inherit;font-size:12px;cursor:pointer}.vmmore ha-icon{--mdc-icon-size:16px}.vm em{font-style:normal;font-size:10.5px;color:var(--mu);text-align:right}
.devs{display:flex;flex-direction:column;gap:8px}
.dev{display:flex;align-items:center;gap:10px;padding:10px;border-radius:14px;background:var(--panel2);border:1px solid var(--line);cursor:pointer}
.dev>ha-icon{color:var(--blue)}
.dn{flex:1;display:flex;flex-direction:column;min-width:0}.dn b{font-size:12.5px}.dn span{font-size:10.5px;color:var(--mu);text-transform:capitalize}
.batt{position:relative;width:40px;height:18px;border-radius:5px;border:2px solid rgba(var(--ink),.3);padding:1px;display:flex;align-items:center;justify-content:center}
.batt::after{content:'';position:absolute;right:-5px;top:4px;width:3px;height:6px;border-radius:0 2px 2px 0;background:rgba(var(--ink),.3)}
.batt i{position:absolute;left:1px;top:1px;bottom:1px;width:calc(var(--b) - 2px);border-radius:2px;background:var(--c)}
.batt ha-icon{--mdc-icon-size:12px;position:relative;color:#fff;filter:drop-shadow(0 0 2px #000)}
.dev em{font-style:normal;font-size:12px;font-weight:600;width:36px;text-align:right}
.valves{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}
.valve{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 6px;border-radius:16px;background:var(--panel2);border:1px solid var(--line);transition:.2s}
.valve .drops{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:rgba(var(--ink),.05);color:var(--mu)}
.valve b{font-size:12.5px}.valve span{font-size:10.5px;color:var(--mu)}
.valve.on{border-color:rgba(56,189,248,.55);background:linear-gradient(180deg,rgba(56,189,248,.22),transparent)}.valve.on .drops{background:rgba(56,189,248,.25);color:#38bdf8;animation:pulseb 1.6s infinite}
@keyframes pulseb{0%{box-shadow:0 0 0 0 rgba(56,189,248,.6)}100%{box-shadow:0 0 0 14px rgba(56,189,248,0)}}
.sched{display:flex;flex-wrap:wrap;gap:6px}
.nextirr{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:8px;margin-bottom:4px}
.ni{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:14px;cursor:pointer;background:linear-gradient(110deg,rgba(56,189,248,.14),transparent);border:1px solid rgba(56,189,248,.28)}
.ni>ha-icon{color:#38bdf8;--mdc-icon-size:22px}.ni:last-child{background:linear-gradient(110deg,rgba(251,191,36,.12),transparent);border-color:rgba(251,191,36,.28)}.ni:last-child>ha-icon{color:var(--amber)}
.ni div{display:flex;flex-direction:column;min-width:0}.ni span{font-size:10.5px;color:var(--mu)}.ni b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ni em{font-style:normal;font-size:10.5px;color:var(--mu)}
.foot{position:relative;text-align:center;font-size:10.5px;color:rgba(139,151,178,.5);padding:16px 0 4px}

/* responsive */
@container app (max-width:1180px){
  .home-grid{grid-template-columns:minmax(0,1fr)}
  .home-grid>.col{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))}
  .tgrid.sec,.tgrid.wide1{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:860px){ .app{padding:14px 12px 8px} .sheet-bg{align-items:flex-end}.sheet{width:100%;max-width:none;border-radius:22px 22px 0 0;max-height:75vh} }
@container app (max-width:820px){
  .tgrid{gap:14px}.home-grid{gap:14px}
  .tb{padding:9px 12px;font-size:12px}
  .viewport{height:max(360px,60vh)}
  .lbl{font-size:10px;padding:3px 7px;gap:4px;border-radius:9px}.lbl .h{display:none}.lbl ha-icon{--mdc-icon-size:12px}
  .lbl.nodata:not(.lit):not(.mo):not(.sel){display:none!important}
  .tools .ibtn{width:32px;height:32px}
  .top{gap:12px;margin-bottom:14px}
  .clock{gap:4px 10px}.clock #time{font-size:36px;letter-spacing:-1.5px}.clock .date{font-size:13px}
  .greet{font-size:13px;padding-right:96px}
  /* header chips: one swipeable row, edge to edge */
  .hdr-right{width:calc(100% + 24px);margin:0 -12px;padding:2px 12px;flex-wrap:nowrap;justify-content:flex-start;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;scroll-padding:0 12px}
  .hdr-right::-webkit-scrollbar{display:none}
  .chip{height:38px;flex:none;font-size:12.5px;padding:0 12px 0 6px;padding-inline:6px 12px;gap:7px}.chip>ha-icon{width:26px;height:26px;--mdc-icon-size:15px}
  .chip.big{padding:0 13px 0 6px;padding-inline:6px 13px}.chip.big b{font-size:13.5px}.chip.big span{font-size:10px}
  /* avatars: top-right corner of the header */
  .hdr-right .persons{position:absolute;top:0;right:0;margin:0}
  [dir=rtl] .hdr-right .persons{right:auto;left:0}[dir=rtl] .greet{padding-right:0;padding-left:96px} /* right to left: the avatars go to the left, clear of the clock */.person{width:38px;height:38px}
  .seg button span{display:none}
  .drawer{top:auto;left:8px;right:8px;bottom:8px;width:auto;max-width:none;max-height:calc(100% - 16px);transform:translateY(calc(100% + 20px))}
  [dir=rtl] .drawer{left:8px;right:8px;transform:translateY(calc(100% + 20px))} /* right to left: full width too, not shrunk to its content */
  /* phones (room_backdrop, on by default): the 3D view behind the open room panel is dimmed and blurred, and a tap on it
     closes the panel; off: no backdrop, a tap on another room switches to it */
  .rback{display:block;position:absolute;inset:0;z-index:4;border-radius:inherit;background:rgba(2,6,23,.4);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;visibility:hidden;transition:opacity .3s,visibility .3s}
  .viewport:has(.drawer.open) .rback{opacity:1;visibility:visible}
  .drawer{z-index:5}
  .camgrid{grid-template-columns:1fr;gap:10px} /* phones: cameras stacked, full width */
}

/* Sweet Home 3D: the 3D view alone, sized by the dashboard (sections grid) or by the height option */
.app.solo{min-height:0;padding:0;background:none;display:flex;flex-direction:column}
.app.solo>.aurora,.app.solo>.top,.app.solo>.tabs,.app.solo>.foot,.app.solo .home-grid>.col{display:none}
.app.solo main,.app.solo .tab.on{flex:1;display:flex;flex-direction:column;min-height:0}
.app.solo .home-grid{flex:1;display:flex;flex-direction:column;align-items:stretch;min-height:0}
.app.solo .stage{flex:1;min-height:0;padding:10px;box-sizing:border-box}
.app.solo .stage-top{margin-bottom:8px;gap:8px}
.app.solo .viewport{flex:none;height:var(--solo-h,420px)}
:host([solo][layout=grid]),:host([solo][layout=grid]) .app.solo{height:100%}
:host([solo][layout=grid]) .app.solo .viewport{flex:1 1 auto;height:auto;min-height:120px}
/* Sweet Home 3D sits among other cards, so it follows the dashboard theme like they do. It is drawn inside a real
   ha-card: the theme's card background, corners, border and shadow apply (and card-mod theme rules such as
   card-mod-card: ha-card {...}). Its text, dividers and buttons take the theme's colours; the 3D picture stays dark (like
   a camera image), with its own colours for the labels on it. Without a theme (or before ha-card is loaded) it falls back
   to the card's own dark look. */
.sh-card{display:block;box-sizing:border-box;min-width:0}
:host([layout=grid]) .sh-card{height:100%}
:where(ha-card.sh-card:not(:defined)){background:var(--ha-card-background,var(--card-background-color,#111827));border-radius:var(--ha-card-border-radius,12px);border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color,var(--divider-color,rgba(var(--ink),.08)));box-shadow:var(--ha-card-box-shadow,none);color:var(--primary-text-color,#e7ecf6)}
.app.solo{--tx:var(--primary-text-color,#e7ecf6);--mu:var(--secondary-text-color,#8b97b2);--line:var(--divider-color,rgba(var(--ink),.08));--panel2:color-mix(in srgb,var(--tx) 6%,transparent);color:var(--tx);font-family:var(--ha-font-family-body,var(--paper-font-body1_-_font-family,Inter,'Segoe UI',Roboto,system-ui,sans-serif))}
.app.solo .stage{background:none;border:0;border-radius:0;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none}
.app.solo .seg{background:color-mix(in srgb,var(--tx) 6%,transparent)}
.app.solo .seg button.on{background:color-mix(in srgb,var(--tx) 12%,transparent);color:var(--tx);box-shadow:none}
@media (hover:hover){.app.solo .ibtn:hover{background:color-mix(in srgb,var(--tx) 10%,transparent)}}
.app.solo .viewport{--tx:#e7ecf6;--mu:#8b97b2;--line:rgba(var(--ink),.08);--panel2:rgba(var(--ink),.04);color:var(--tx);border-color:var(--divider-color,rgba(var(--ink),.08));border-radius:max(4px,calc(var(--ha-card-border-radius,12px) - 4px))}
/* the room pop-up: the theme's card surface and text colours */
.rpop{--tx:var(--primary-text-color,#e7ecf6);--mu:var(--secondary-text-color,#8b97b2);--line:var(--divider-color,rgba(var(--ink),.12));--panel2:color-mix(in srgb,var(--tx) 6%,transparent)}
.rpop .dh{background:var(--ha-card-background,var(--card-background-color,#0f172a))}
.rpop .drawer.open{border-color:var(--divider-color,rgba(var(--ink),.12));color:var(--tx)}
/* Home Lab: one chip per Proxmox node when there are several */
.labnodes{display:flex;flex-wrap:wrap;gap:6px;margin:-4px 0 12px}
.labnodes button{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;font-size:12px;font-weight:600;color:var(--mu);background:var(--panel2);border:1px solid var(--line)}
.labnodes button ha-icon{--mdc-icon-size:15px}
.labnodes button.on{color:var(--teal);border-color:color-mix(in srgb,var(--teal) 50%,transparent);background:color-mix(in srgb,var(--teal) 14%,transparent)}
/* right to left: arrows and chevrons that mean back / forward point the other way */
[dir=rtl] :is(ha-icon[icon="mdi:chevron-left"],ha-icon[icon="mdi:chevron-right"],ha-icon[icon="mdi:arrow-left"],ha-icon[icon="mdi:arrow-right"],ha-icon[icon="mdi:arrow-right-thin"],ha-icon[icon="mdi:arrow-left-thin"]){transform:scaleX(-1)}
.rpop{position:fixed;inset:0;z-index:59;display:none;align-items:center;justify-content:center;background:rgba(2,6,23,.55);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);overscroll-behavior:contain;font-family:'Inter',system-ui,sans-serif;color:var(--tx)}
.rpop.open{display:flex;animation:fade .2s}
.rpop .drawer,.rpop .drawer.open,[dir=rtl].rpop .drawer{position:relative;inset:auto;top:auto;right:auto;bottom:auto;left:auto;width:min(420px,calc(100% - 32px));max-width:none;max-height:min(80vh,720px);transform:none;background:var(--ha-card-background,var(--card-background-color,#0f172a));border-radius:var(--ha-dialog-border-radius,22px);box-shadow:0 30px 80px -20px rgba(0,0,0,.8);animation:pop .22s cubic-bezier(.2,.8,.2,1)}
@media (max-width:860px){.rpop{align-items:flex-end}.rpop .drawer,.rpop .drawer.open,[dir=rtl].rpop .drawer{width:100%;max-height:80vh;border-radius:22px 22px 0 0}}
/* Light look (appearance: light, or auto with a light Home Assistant theme). The overlays (--ink), surfaces (--s1..3)
   and accents switch to light-background values; the 3D view and the room panel over it keep the dark ones. */
:host([look=light]){--bg:#eef2f7;--panel:rgba(255,255,255,.82);--panel2:rgba(15,23,42,.035);--line:rgba(15,23,42,.1);--tx:#0f172a;--mu:#5b6478;--ink:15,23,42;--s1:255,255,255;--s2:255,255,255;--s3:255,255,255;--hi:#0f172a;--sheet:#ffffff;--teal:#0d9488;--amber:#b45309;--rose:#e11d48;--violet:#7c3aed;--blue:#2563eb;--green:#059669}
:host([look=light]) .app:not(.solo){background:radial-gradient(1200px 700px at 15% -10%,#dbeafe 0%,transparent 60%),radial-gradient(900px 600px at 100% 10%,#ede9fe 0%,transparent 55%),radial-gradient(900px 700px at 50% 120%,#ccfbf1 0%,transparent 60%),var(--bg)}
:host([look=light]) .aurora{opacity:.12}
:host([look=light]) .card{box-shadow:0 10px 30px -18px rgba(15,23,42,.35),inset 0 1px 0 rgba(255,255,255,.6)}
:host([look=light]) .viewport,:host([look=light]) .cam{--ink:255,255,255;--s1:8,12,24;--s2:10,15,30;--s3:13,19,36;--hi:#fff;--tx:#e7ecf6;--mu:#8b97b2;--line:rgba(255,255,255,.08);--panel2:rgba(255,255,255,.04);--teal:#2dd4bf;--amber:#fbbf24;--rose:#fb7185;--violet:#a78bfa;--blue:#60a5fa;--green:#34d399;color:var(--tx)}
:host([look=light]) .viewport .drawer{--ink:15,23,42;--s1:255,255,255;--s2:255,255,255;--s3:255,255,255;--hi:#0f172a;--tx:#0f172a;--mu:#5b6478;--line:rgba(15,23,42,.1);--panel2:rgba(15,23,42,.04);--teal:#0d9488;--amber:#b45309;--rose:#e11d48;--violet:#7c3aed;--blue:#2563eb;--green:#059669;color:var(--tx);background:rgba(255,255,255,.96);border-color:rgba(15,23,42,.08);box-shadow:0 20px 50px -20px rgba(15,23,42,.5)}
:host([look=light]) .viewport .drawer .dh{background:rgba(255,255,255,.96)}:host([look=light]) .viewport .drawer .dstats b{filter:brightness(.72) saturate(1.3)} /* light look: a white room panel */
/* pale text colours chosen for the dark look: darker shades of the same colours on a light background */
:host([look=light]) .seg{background:rgba(15,23,42,.06);border-color:rgba(15,23,42,.08)}
:host([look=light]) .seg button{color:var(--mu)}
:host([look=light]) .seg button.on,:host([look=light]) .app.solo .seg button.on{background:var(--card-background-color,#fff);color:var(--tx);box-shadow:0 1px 3px rgba(15,23,42,.18),0 0 0 1px rgba(15,23,42,.04)}
:host([look=light]) .art{background:rgba(15,23,42,.06)}
/* the water tank's label: white on the water, dark on the empty glass above it (light look) */
:host([look=light]) .tank-lbl.wet{color:#fff;text-shadow:0 1px 6px rgba(8,47,73,.45)}:host([look=light]) .tank-lbl.wet span{color:#e0f2fe}
:host([look=light]) .tank-lbl.dry{color:var(--tx);text-shadow:none}:host([look=light]) .tank-lbl.dry span{color:var(--mu)}
:host([look=light]) .pill{color:color-mix(in srgb,var(--c,#64748b) 65%,#0f172a)}
:host([look=light]) .clock #time{background:linear-gradient(120deg,#0f172a 30%,#4f46e5 70%,#0d9488);-webkit-background-clip:text;background-clip:text}
:host([look=light]) :is(.jfi em,.mlib div.go span,.jfshowh em){color:#6d28d9}:host([look=light]) .n-dev ha-icon{color:#7c3aed}
:host([look=light]) :is(.mqr b,.wxhc em,.wxd em,.ehbal.imp .ehbal-t b){color:#1d4ed8}
:host([look=light]) :is(.mupt span,.ehspin,.mupov,.wte p,.mupchips span){color:var(--mu)}
:host([look=light]) :is(.wxhc ha-icon,.wxd>ha-icon,.wxnow.cloud .wxbig,.wxnow.snow .wxbig){color:#64748b}
:host([look=light]) :is(.mlib .warn b,.wtei b){color:#b45309}
:host([look=light]) :is(.wrow .ubtn,.wrow .ubtn ha-icon,.pwgo,.ehnow){color:#0f766e}
:host([look=light]) :is(.alsec i,.wrow .rbtn,.swr .rbtn,.wrow .rbtn ha-icon,.swr .rbtn ha-icon){color:#be123c}
`;
