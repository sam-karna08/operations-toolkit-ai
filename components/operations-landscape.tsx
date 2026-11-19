"use client";

import { ArrowDown, ArrowRight, Factory, PackageCheck, Truck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

const stages = [
  { id: "input", label: "INPUT", title: "Signals enter the system", detail: "Demand, materials, people, and constraints shape what the operation can take on." },
  { id: "process", label: "PROCESS", title: "Work moves through the flow", detail: "Handoffs, queues, and capacity determine how reliably work progresses." },
  { id: "quality", label: "QUALITY", title: "Quality is built into the work", detail: "Checks and feedback reveal whether outputs meet the need before they move forward." },
  { id: "fulfilment", label: "FULFILMENT", title: "Orders become outcomes", detail: "Planning, inventory, and coordination connect completed work to customer demand." },
  { id: "delivery", label: "DELIVERY", title: "Value reaches its destination", detail: "The final handoff makes service, lead time, and reliability visible." },
  { id: "insights", label: "INSIGHTS", title: "Evidence guides improvement", detail: "Measures and feedback help teams test what changed and decide what to improve next." },
];

const stations = [
  { id: "input", x: 118, y: 198, name: "INPUT", cx: 159, cy: 186 },
  { id: "process", x: 310, y: 160, name: "PROCESS", cx: 351, cy: 148 },
  { id: "quality", x: 488, y: 206, name: "QUALITY", cx: 529, cy: 194 },
  { id: "fulfilment", x: 621, y: 152, name: "FULFILMENT", cx: 668, cy: 140 },
  { id: "delivery", x: 747, y: 221, name: "DELIVERY", cx: 788, cy: 209 },
  { id: "insights", x: 367, y: 326, name: "INSIGHTS", cx: 414, cy: 314 },
];

function scrollToProblem(onBegin: () => void) {
  onBegin();
  window.setTimeout(() => {
    const target = document.getElementById("business-problem");
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus();
  }, 80);
}

export function OperationsLandscape({ onBegin }: { onBegin: () => void }) {
  const [activeStage, setActiveStage] = useState(0);
  const chapterRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const observed = chapterRefs.current.filter((item): item is HTMLElement => item !== null);
    if (!observed.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const current = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (!current) return;
      const index = observed.indexOf(current.target as HTMLElement);
      if (index >= 0) setActiveStage(index);
    }, { rootMargin: "-30% 0px -38% 0px", threshold: [0.1, 0.3, 0.6] });
    observed.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const active = stages[activeStage];
  return (
    <section aria-labelledby="operations-world-title" className="operations-world mx-auto max-w-[1440px] px-4 pb-8 pt-5 sm:px-7 lg:px-10">
      <div className="world-opening relative overflow-hidden rounded-[30px] border border-[#d9c9f3] px-5 pb-6 pt-7 sm:px-9 sm:pt-10 lg:px-14 lg:pb-10">
        <div className="world-grain pointer-events-none absolute inset-0" />
        <div className="relative z-10 grid items-end gap-6 lg:grid-cols-[0.86fr_1.14fr]">
          <div className="max-w-[550px]">
            <p className="world-eyebrow"><span className="world-pulse" /> OPERATIONS, MADE VISIBLE</p>
            <h1 id="operations-world-title" className="world-title mt-4">
              Turn business problems into <span>structured solutions.</span>
            </h1>
            <p className="mt-4 max-w-[470px] text-[13px] leading-[1.8] text-[#615675] sm:text-[15px]">
              Follow the flow from first signal to final delivery. Find where work slows, what evidence matters, and which change to test next.
            </p>
            <button type="button" onClick={() => scrollToProblem(onBegin)} className="world-primary-button mt-6">
              Begin a diagnostic <ArrowDown size={15} />
            </button>
            <p className="mt-3 text-[10px] text-[#766b89]">A guided, evidence-first path · Gemini analysis with visible uncertainty</p>
          </div>
          <div className="world-hero-scene relative mx-auto w-full max-w-[760px]" aria-label="Illustrated isometric factory connecting inputs, production, quality, fulfilment, delivery, and insights">
            <FactoryScene activeStage={activeStage} />
          </div>
        </div>
        <div className="world-stage-rail relative z-10 mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-6 sm:gap-2">
          {stages.map((stage, index) => (
            <button
              key={stage.id}
              type="button"
              onClick={() => chapterRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" })}
              aria-current={activeStage === index ? "step" : undefined}
              className={`world-stage-chip ${activeStage === index ? "is-active" : ""}`}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>{stage.label}
            </button>
          ))}
        </div>
      </div>

      <div className="world-chapters mt-3 grid items-start gap-4 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="world-scene-pin">
          <div className="world-scene-frame">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="world-scene-kicker"><span className="world-pulse" /> LIVE OPERATIONAL MAP</span>
              <span className="text-[9px] font-medium text-[#807394]">SCROLL TO FOLLOW THE FLOW</span>
            </div>
            <FactoryScene activeStage={activeStage} compact />
            <div className="world-active-note">
              <div>
                <span className="text-[8px] font-bold uppercase tracking-[1.2px] text-[#827298]">Stage {String(activeStage + 1).padStart(2, "0")} / 06</span>
                <h2 className="mt-1 text-[14px] font-semibold text-[#403552]">{active.title}</h2>
                <p className="mt-1 text-[10px] leading-[1.6] text-[#756986]">{active.detail}</p>
              </div>
              <span className="world-active-label">{active.label}</span>
            </div>
          </div>
        </div>
        <div className="world-chapter-list">
          {stages.map((stage, index) => (
            <article
              key={stage.id}
              id={`world-stage-${stage.id}`}
              ref={(element) => { chapterRefs.current[index] = element; }}
              className={`world-chapter ${activeStage === index ? "is-current" : ""}`}
            >
              <span className="world-chapter-number">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <p className="world-chapter-label">{stage.label}</p>
                <h3>{stage.title}</h3>
                <p>{stage.detail}</p>
              </div>
              <ArrowRight size={16} aria-hidden="true" />
            </article>
          ))}
          <button type="button" onClick={() => scrollToProblem(onBegin)} className="world-next-step">
            Bring your operation into view <ArrowDown size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}

function FactoryScene({ activeStage, compact = false }: { activeStage: number; compact?: boolean }) {
  const prefix = useId().replaceAll(":", "");
  return (
    <svg
      className={`factory-scene ${compact ? "factory-scene-compact" : ""}`}
      viewBox="0 0 900 460"
      role="img"
      aria-labelledby={`${prefix}-title`}
    >
      <title id={`${prefix}-title`}>A miniature operations landscape with a factory, conveyors, warehouse, delivery route, and data signals.</title>
      <defs>
        <linearGradient id={`${prefix}-floor`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fdf9ff" />
          <stop offset="1" stopColor="#e9ddfa" />
        </linearGradient>
        <linearGradient id={`${prefix}-roof`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#c9aff3" />
          <stop offset="1" stopColor="#9b7cda" />
        </linearGradient>
        <linearGradient id={`${prefix}-side`} x1="0" y1="0" x2="0.9" y2="1">
          <stop stopColor="#ac91df" />
          <stop offset="1" stopColor="#755cae" />
        </linearGradient>
        <linearGradient id={`${prefix}-conveyor`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fffefd" />
          <stop offset="1" stopColor="#d7c8ec" />
        </linearGradient>
        <filter id={`${prefix}-shadow`} x="-30%" y="-30%" width="160%" height="180%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="10" />
          <feOffset dy="12" />
          <feComponentTransfer><feFuncA type="linear" slope=".18" /></feComponentTransfer>
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <pattern id={`${prefix}-grid`} width="48" height="28" patternTransform="skewY(-28) scale(1 1.15)" patternUnits="userSpaceOnUse">
          <path d="M48 0H0V28" fill="none" stroke="#ad98d0" strokeOpacity=".22" strokeWidth="1" />
        </pattern>
      </defs>
      <path d="M450 12 880 234 450 453 20 234Z" fill={`url(#${prefix}-floor)`} />
      <path d="M450 12 880 234 450 453 20 234Z" fill={`url(#${prefix}-grid)`} />
      <g className="factory-landscape" style={{ transform: `translateY(${activeStage * -1.5}px) scale(${compact ? 1 : 1 + activeStage * 0.006})` }}>
        <path d="M69 285 190 222 298 278 178 341Z" fill="#cab8e3" opacity=".58" />
        <path d="M559 331 730 241 833 294 663 382Z" fill="#cab8e3" opacity=".58" />
        <g filter={`url(#${prefix}-shadow)`}>
          <g className={`world-station ${activeStage === 1 ? "is-lit" : ""}`}>
            <path d="M279 152 431 73 570 145 417 224Z" fill={`url(#${prefix}-roof)`} />
            <path d="M279 152V248L417 320V224Z" fill="#af95df" />
            <path d="M417 224V320L570 239V145Z" fill={`url(#${prefix}-side)`} />
            <path d="M300 156 431 89 548 149 417 217Z" fill="#eee7f9" />
            <path d="M320 168 430 111 526 160 416 216Z" fill="#8064bb" />
            <path d="M343 177 430 132 503 169 416 214Z" fill="#bba6e8" />
            <path d="M351 183 430 142 494 174 416 214Z" fill="#6f558f" />
            <path d="M355 186 430 148 486 176 416 213Z" fill="#f3e7fb" />
            <path d="M375 196 420 173 462 194 417 218Z" fill="#faf6ff" />
            <path d="M417 224V290L465 265V199Z" fill="#d9cdf0" />
            <path d="M429 230V270L456 256V216Z" fill="#8d75c2" />
            <path d="M430 149V186" stroke="#a9fae7" strokeWidth="4" strokeLinecap="round" />
          </g>
          <g className={`world-station ${activeStage === 3 ? "is-lit" : ""}`}>
            <path d="M608 106 700 59 783 102 690 151Z" fill="#d9c8f2" />
            <path d="M608 106V206L690 249V151Z" fill="#b49adf" />
            <path d="M690 151V249L783 199V102Z" fill="#8066b8" />
            <path d="M624 105 700 66 766 100 690 139Z" fill="#f7efff" />
            <path d="M627 122 686 153V208L627 178Z" fill="#eee5fb" />
            <path d="M700 155 760 124V179L700 211Z" fill="#c6b3e8" />
            <path d="M701 88 748 111 748 137 701 113Z" fill="#9ddbd4" />
            <path d="M701 88 748 111" stroke="#f4e8ff" strokeWidth="4" />
          </g>
          <g className={`world-station ${activeStage === 5 ? "is-lit" : ""}`}>
            <path d="M93 151 172 110 247 149 168 190Z" fill="#d6c6ed" />
            <path d="M93 151V197L168 237V190Z" fill="#ad91db" />
            <path d="M168 190V237L247 196V149Z" fill="#8065b2" />
            <rect x="126" y="139" width="51" height="27" rx="4" transform="rotate(-27 126 139)" fill="#fffafd" stroke="#b39bd7" strokeWidth="2" />
            <path d="m133 160 10-10 8 4 11-13" fill="none" stroke="#72bdb3" strokeWidth="3" strokeLinecap="round" />
            <circle cx="160" cy="142" r="3" fill="#c789d4" />
          </g>
        </g>
        <g className="world-conveyor">
          <path d="m73 281 106-55 113 59-107 56Z" fill="#b3a0cf" />
          <path d="m73 263 106-55 113 59-107 56Z" fill={`url(#${prefix}-conveyor)`} stroke="#b6a4d0" strokeWidth="3" />
          <path d="m87 263 92-47 92 48-93 48Z" fill="none" stroke="#bc82dc" strokeWidth="7" strokeLinejoin="round" />
          <path d="m95 262 84-43 83 44-85 43Z" fill="none" stroke="#fffaff" strokeWidth="2" strokeDasharray="3 7" />
          <path d="m351 278 109-57 112 59-111 58Z" fill="#b3a0cf" />
          <path d="m351 260 109-57 112 59-111 58Z" fill={`url(#${prefix}-conveyor)`} stroke="#b6a4d0" strokeWidth="3" />
          <path d="m367 260 93-48 91 49-94 49Z" fill="none" stroke="#80cfc4" strokeWidth="7" strokeLinejoin="round" />
          <path d="m378 260 82-42 80 43-82 43Z" fill="none" stroke="#fffaff" strokeWidth="2" strokeDasharray="3 7" />
          <path d="m593 273 96-51 106 56-97 51Z" fill="#b3a0cf" />
          <path d="m593 255 96-51 106 56-97 51Z" fill={`url(#${prefix}-conveyor)`} stroke="#b6a4d0" strokeWidth="3" />
          <path d="m610 255 79-42 87 46-80 42Z" fill="none" stroke="#d895ad" strokeWidth="7" strokeLinejoin="round" />
          <path d="m618 255 71-37 77 41-72 38Z" fill="none" stroke="#fffaff" strokeWidth="2" strokeDasharray="3 7" />
        </g>
        <g className="world-parcels">
          <path d="m140 237 27-14 25 13-27 14Z" fill="#f4c996" stroke="#d29c73" />
          <path d="m140 237v17l25 13v-17Z" fill="#e7b77e" />
          <path d="m165 250v17l27-14v-17Z" fill="#cf9469" />
          <path d="m408 236 28-15 26 14-28 15Z" fill="#f3ca96" stroke="#d29c73" />
          <path d="m408 236v17l26 14v-17Z" fill="#e7b77e" />
          <path d="m434 250v17l28-15v-17Z" fill="#cf9469" />
          <path d="m659 235 25-13 25 13-26 14Z" fill="#f5d6a5" stroke="#d29c73" />
          <path d="m659 235v17l24 13v-16Z" fill="#e7b77e" />
          <path d="m683 249v16l26-14v-16Z" fill="#cf9469" />
        </g>
        <g className="world-data-lines" fill="none" strokeLinecap="round">
          <path d="M169 183Q219 132 306 139" stroke="#a47bd2" strokeWidth="2" strokeDasharray="4 7" />
          <path d="M530 191Q576 164 632 160" stroke="#81bdb1" strokeWidth="2" strokeDasharray="4 7" />
          <path d="M699 218Q742 246 779 218" stroke="#cb8ca8" strokeWidth="2" strokeDasharray="4 7" />
          <path d="M404 312Q351 365 305 332" stroke="#a47bd2" strokeWidth="2" strokeDasharray="4 7" />
        </g>
        <g transform="translate(738 300)">
          <path d="m0 22 42-22 60 31-42 22Z" fill="#c8b3e3" />
          <path d="m8 18 34-18 50 26-35 18Z" fill="#fff6fc" stroke="#af98d1" strokeWidth="2" />
          <path d="m10 18v18l47 25V43Z" fill="#d99eb5" />
          <path d="m57 43v18l35-18V26Z" fill="#ac7799" />
          <circle cx="27" cy="48" r="8" fill="#5b4b6c" />
          <circle cx="27" cy="48" r="3" fill="#e7e1ef" />
          <circle cx="77" cy="47" r="8" fill="#5b4b6c" />
          <circle cx="77" cy="47" r="3" fill="#e7e1ef" />
        </g>
        <g className="world-station-markers">
          {stations.map((station, index) => (
            <g key={station.id} className={activeStage === index ? "is-lit" : ""}>
              <circle cx={station.cx} cy={station.cy} r="9" fill="#fffdfd" stroke={activeStage === index ? "#9a70cb" : "#b9a7ce"} strokeWidth="2" />
              <circle cx={station.cx} cy={station.cy} r="3" fill={activeStage === index ? "#8f6ac0" : "#bca9d0"} />
              <text x={station.cx} y={station.cy - 16} textAnchor="middle">{station.name}</text>
            </g>
          ))}
        </g>
      </g>
      <foreignObject x="28" y="22" width="52" height="52">
        <div className="world-icon world-icon-factory"><Factory size={16} /></div>
      </foreignObject>
      <foreignObject x="820" y="354" width="52" height="52">
        <div className="world-icon world-icon-delivery"><Truck size={16} /></div>
      </foreignObject>
      <foreignObject x="787" y="29" width="52" height="52">
        <div className="world-icon world-icon-quality"><PackageCheck size={16} /></div>
      </foreignObject>
    </svg>
  );
}
