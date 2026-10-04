import { BookOpen, Check, ClipboardCheck, Mail, Minus, Package, Pencil, Sticker, Truck } from "lucide-react";
import { KIT_SHIPS_WITHIN_DAYS, PRODUCTS } from "../lib/products";

// The mailed explorer kit, drawn as a flat-lay of everything in the parcel,
// and the section that sells it next to the free booklet PDF. Drawn in the
// site's own palette rather than as a photo, so it shows the real contents
// before the first kits have been photographed.

const palette = {
  ink: "#17312e",
  paper: "#fffdf7",
  teal: "#3c6e83",
  coral: "#d97a63",
  sun: "#e6ac4e",
  sky: "#a8d7e2",
  leaf: "#7c9463",
  paleBlue: "#e4eef1",
  paleCoral: "#f7e2da",
  paleYellow: "#faedd0",
  paleLeaf: "#e8ecdf",
};

function Star({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = (Math.PI / 5) * index - Math.PI / 2;
    const radius = index % 2 === 0 ? r : r * 0.45;
    return `${(x + Math.cos(angle) * radius).toFixed(1)},${(y + Math.sin(angle) * radius).toFixed(1)}`;
  }).join(" ");
  return <polygon points={points} fill={fill} stroke={palette.ink} strokeWidth={1.4} strokeLinejoin="round" />;
}

function Sparkle({ x, y, size, fill = palette.sun }: { x: number; y: number; size: number; fill?: string }) {
  const s = size;
  return (
    <path
      d={`M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s}Z`}
      fill={fill}
    />
  );
}

// One round sticker: a coloured disc with a small drawn mark.
function StickerDisc({ x, y, r, fill, mark }: { x: number; y: number; r: number; fill: string; mark: "star" | "heart" | "check" | "smile" | "pin" | "sun" }) {
  const ink = palette.ink;
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={fill} stroke={ink} strokeWidth={1.4} />
      {mark === "star" ? <Star x={x} y={y} r={r * 0.55} fill={palette.paper} /> : null}
      {mark === "heart" ? (
        <path
          d={`M${x} ${y + r * 0.45} C${x - r * 0.9} ${y - r * 0.1} ${x - r * 0.45} ${y - r * 0.75} ${x} ${y - r * 0.25} C${x + r * 0.45} ${y - r * 0.75} ${x + r * 0.9} ${y - r * 0.1} ${x} ${y + r * 0.45}Z`}
          fill={palette.paper}
          stroke={ink}
          strokeWidth={1.2}
        />
      ) : null}
      {mark === "check" ? (
        <path d={`M${x - r * 0.42} ${y} L${x - r * 0.1} ${y + r * 0.32} L${x + r * 0.45} ${y - r * 0.35}`} fill="none" stroke={palette.paper} strokeWidth={r * 0.22} strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
      {mark === "smile" ? (
        <g fill="none" stroke={ink} strokeWidth={1.3} strokeLinecap="round">
          <circle cx={x - r * 0.28} cy={y - r * 0.18} r={0.8} fill={ink} />
          <circle cx={x + r * 0.28} cy={y - r * 0.18} r={0.8} fill={ink} />
          <path d={`M${x - r * 0.38} ${y + r * 0.12} Q${x} ${y + r * 0.5} ${x + r * 0.38} ${y + r * 0.12}`} />
        </g>
      ) : null}
      {mark === "pin" ? (
        <g>
          <path d={`M${x} ${y + r * 0.55} C${x - r * 0.5} ${y} ${x - r * 0.45} ${y - r * 0.5} ${x} ${y - r * 0.5} C${x + r * 0.45} ${y - r * 0.5} ${x + r * 0.5} ${y} ${x} ${y + r * 0.55}Z`} fill={palette.paper} stroke={ink} strokeWidth={1.2} />
          <circle cx={x} cy={y - r * 0.12} r={r * 0.16} fill={fill} />
        </g>
      ) : null}
      {mark === "sun" ? (
        <g stroke={ink} strokeWidth={1.2} strokeLinecap="round">
          <circle cx={x} cy={y} r={r * 0.28} fill={palette.paper} />
          {Array.from({ length: 8 }, (_, index) => {
            const angle = (index / 8) * Math.PI * 2;
            return <line key={index} x1={x + Math.cos(angle) * r * 0.42} y1={y + Math.sin(angle) * r * 0.42} x2={x + Math.cos(angle) * r * 0.62} y2={y + Math.sin(angle) * r * 0.62} />;
          })}
        </g>
      ) : null}
    </g>
  );
}

export function KitIllustration({ destination, childName, compact = false }: { destination: string; childName: string; compact?: boolean }) {
  const ink = palette.ink;
  const title = destination.length > 12 ? `${destination.slice(0, 11)}…` : destination;
  const titleSize = title.length > 9 ? 17 : 21;
  // Without a real name the family default reads "Explorer 1".
  const named = /^Explorer \d+$/.test(childName) ? "your explorer" : childName;
  const name = named.length > 13 ? `${named.slice(0, 12)}…` : named;
  const pencils = [palette.coral, palette.sun, palette.leaf, palette.teal, palette.sky];
  const sheet = [
    [palette.coral, "star"], [palette.sun, "sun"], [palette.teal, "check"],
    [palette.leaf, "heart"], [palette.sky, "smile"], [palette.coral, "pin"],
    [palette.sun, "check"], [palette.teal, "star"], [palette.leaf, "smile"],
    [palette.sky, "heart"], [palette.coral, "sun"], [palette.sun, "pin"],
  ] as const;
  return (
    <svg
      className={`kit-illustration${compact ? " kit-illustration-compact" : ""}`}
      viewBox="0 0 560 420"
      role="img"
      aria-label={`The ${destination} explorer kit: a printed booklet, sticker sheets, a parent guide, a sealed mystery envelope and coloured pencils in a zip pouch`}
    >
      <rect x="18" y="26" width="524" height="372" rx="34" fill={palette.paleYellow} />
      <circle cx="470" cy="70" r="70" fill={palette.paleCoral} />
      <circle cx="70" cy="360" r="60" fill={palette.paleLeaf} />

      {/* Parent guide */}
      <g transform="rotate(9 455 140)">
        <rect x="398" y="58" width="116" height="160" rx="6" fill={palette.paleBlue} stroke={ink} strokeWidth={2} />
        <rect x="398" y="58" width="116" height="30" rx="6" fill={palette.teal} stroke={ink} strokeWidth={2} />
        <text x="456" y="78" textAnchor="middle" fontSize="12" fontWeight="700" fill={palette.paper} fontFamily="var(--font-body), sans-serif">Parent guide</text>
        {[0, 1, 2, 3, 4].map((row) => (
          <g key={row}>
            <path d={`M412 ${108 + row * 21} l4 4 l8 -9`} fill="none" stroke={palette.leaf} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            <line x1="432" y1={110 + row * 21} x2={496 - (row % 2) * 16} y2={110 + row * 21} stroke={ink} strokeOpacity={0.35} strokeWidth={2} strokeLinecap="round" />
          </g>
        ))}
      </g>

      {/* Sticker sheet */}
      <g transform="rotate(5 322 150)">
        <rect x="246" y="40" width="152" height="212" rx="8" fill={palette.paper} stroke={ink} strokeWidth={2} />
        <text x="322" y="62" textAnchor="middle" fontSize="10" fontWeight="700" fill={palette.teal} fontFamily="var(--font-body), sans-serif" letterSpacing="1">MY STICKERS</text>
        {sheet.map(([fill, mark], index) => {
          const col = index % 3;
          const row = Math.floor(index / 3);
          const x = 274 + col * 48;
          const y = 92 + row * 46;
          return index === 4
            ? <circle key={index} cx={x} cy={y} r={18} fill="none" stroke={ink} strokeOpacity={0.45} strokeWidth={1.3} strokeDasharray="4 3" />
            : <StickerDisc key={index} x={x} y={y} r={18} fill={fill} mark={mark} />;
        })}
      </g>

      {/* Booklet */}
      <g transform="rotate(-6 150 170)">
        <rect x="66" y="48" width="172" height="244" rx="6" fill={palette.ink} opacity="0.12" transform="translate(5 6)" />
        <rect x="66" y="48" width="172" height="244" rx="6" fill={palette.paper} stroke={ink} strokeWidth={2.2} />
        <rect x="66" y="48" width="172" height="64" rx="6" fill={palette.teal} stroke={ink} strokeWidth={2.2} />
        <text x="152" y="76" textAnchor="middle" fontSize={titleSize} fontWeight="700" fill={palette.paper} fontFamily="var(--font-display), sans-serif">{title}</text>
        <text x="152" y="97" textAnchor="middle" fontSize="10.5" fontWeight="700" fill={palette.paleYellow} letterSpacing="2.5" fontFamily="var(--font-body), sans-serif">EXPLORER</text>
        {/* Cover scene: sun, hills, a little landmark */}
        <rect x="80" y="122" width="144" height="24" rx="12" fill={palette.paleYellow} stroke={ink} strokeWidth={1.4} />
        <text x="152" y="138" textAnchor="middle" fontSize="11" fontWeight="700" fill={ink} fontFamily="var(--font-body), sans-serif">Made for {name}</text>
        <circle cx="206" cy="170" r="12" fill={palette.sun} stroke={ink} strokeWidth={1.6} />
        <path d="M70 232 Q110 186 150 214 Q186 190 234 226 L234 250 L70 250Z" fill={palette.paleLeaf} stroke={ink} strokeWidth={1.6} />
        <path d="M118 214 L118 178 L132 162 L146 178 L146 214Z" fill={palette.paleCoral} stroke={ink} strokeWidth={1.6} strokeLinejoin="round" />
        <path d="M112 180 L132 154 L152 180Z" fill={palette.coral} stroke={ink} strokeWidth={1.6} strokeLinejoin="round" />
        <rect x="127" y="190" width="10" height="24" rx="5" fill={palette.paper} stroke={ink} strokeWidth={1.4} />
        <path d="M156 214 L156 184 L178 184 L178 214Z" fill={palette.paleBlue} stroke={ink} strokeWidth={1.6} />
        <path d="M152 186 L167 172 L182 186Z" fill={palette.teal} stroke={ink} strokeWidth={1.6} strokeLinejoin="round" />
        <path d="M84 168 q6 -6 12 0 q6 -6 12 0" fill="none" stroke={ink} strokeWidth={1.4} strokeLinecap="round" />
        <line x1="66" y1="120" x2="72" y2="120" stroke={ink} strokeWidth={2} />
        <line x1="66" y1="226" x2="72" y2="226" stroke={ink} strokeWidth={2} />
      </g>
      {/* The sticker peeled from the sheet, stuck on the booklet */}
      <g transform="rotate(-12 222 262)">
        <StickerDisc x={222} y={262} r={19} fill={palette.sky} mark="smile" />
      </g>

      {/* Pencils in their pouch */}
      <g transform="rotate(-4 150 330)">
        {pencils.map((fill, index) => {
          const x = 70 + index * 30;
          const top = 262 - (index % 2) * 14;
          return (
            <g key={fill + index} transform={`rotate(${(index - 2) * 5} ${x + 7} 330)`}>
              <rect x={x} y={top} width="14" height="76" fill={fill} stroke={ink} strokeWidth={1.6} />
              <path d={`M${x} ${top} L${x + 7} ${top - 18} L${x + 14} ${top}Z`} fill="#f1d7b0" stroke={ink} strokeWidth={1.6} strokeLinejoin="round" />
              <path d={`M${x + 4.2} ${top - 11.5} L${x + 7} ${top - 18} L${x + 9.8} ${top - 11.5}Z`} fill={fill} stroke={ink} strokeWidth={1.2} strokeLinejoin="round" />
            </g>
          );
        })}
        <rect x="46" y="300" width="208" height="78" rx="18" fill={palette.paleCoral} stroke={ink} strokeWidth={2.2} />
        <line x1="62" y1="312" x2="238" y2="312" stroke={ink} strokeWidth={1.6} strokeDasharray="3 3" />
        <rect x="226" y="304" width="12" height="20" rx="4" fill={palette.sun} stroke={ink} strokeWidth={1.6} />
        <text x="150" y="350" textAnchor="middle" fontSize="13" fontWeight="700" fill={palette.coral} fontFamily="var(--font-display), sans-serif">pencils</text>
      </g>

      {/* Mystery envelope, sealed with its sticker */}
      <g transform="rotate(-7 400 318)">
        <rect x="312" y="262" width="178" height="112" rx="6" fill="#f3d9a8" stroke={ink} strokeWidth={2.2} />
        <path d="M312 268 L401 326 L490 268" fill="none" stroke={ink} strokeWidth={2} strokeLinejoin="round" />
        <path d="M312 374 L380 318 M490 374 L422 318" fill="none" stroke={ink} strokeOpacity={0.5} strokeWidth={1.6} />
        <circle cx="401" cy="326" r="19" fill={palette.coral} stroke={ink} strokeWidth={1.8} />
        <text x="401" y="333" textAnchor="middle" fontSize="20" fontWeight="700" fill={palette.paper} fontFamily="var(--font-display), sans-serif">?</text>
        <text x="401" y="366" textAnchor="middle" fontSize="12" fill={ink} fontFamily="var(--font-display), sans-serif">Open when you finish!</text>
      </g>

      <Sparkle x={254} y={286} size={11} />
      <Sparkle x={516} y={238} size={9} fill={palette.coral} />
      <Sparkle x={44} y={84} size={10} fill={palette.teal} />
      <Sparkle x={300} y={24} size={8} />
      <Sparkle x={518} y={392} size={7} fill={palette.leaf} />
    </svg>
  );
}

const comparison: Array<{ label: string; free: string | false; kit: string }> = [
  { label: "Games matched to your itinerary, day by day", free: "Print it yourself", kit: "Printed in colour, stapled" },
  { label: "A sticker for every game, plus a name sticker", free: false, kit: "Ready to peel" },
  { label: "Mystery envelope for the end of the treat trail", free: false, kit: "Sealed surprise" },
  { label: "Parent guide with every answer", free: false, kit: "Included" },
  { label: "Coloured pencils in a zip pouch", free: false, kit: "Included" },
  { label: "Delivery", free: false, kit: "Posted to your door" },
];

const kitPerks = [
  { icon: BookOpen, title: "A real booklet", text: "Full colour on thick paper, stapled at the spine, sized to fit a backpack." },
  { icon: Sticker, title: "Sticker rewards", text: "Every finished game earns its own sticker. The sheets carry your child's name." },
  { icon: Mail, title: "A mystery envelope", text: "Sealed until the treat trail is done, with a surprise inside." },
  { icon: ClipboardCheck, title: "Parent guide", text: "Every answer in one place, so grown-ups can help without spoilers." },
  { icon: Pencil, title: "Pencils and pouch", text: "Mini coloured pencils, ready for the plane, the queue and the hotel." },
];

export function KitShowcase({
  destination,
  childName,
  onOrder,
}: {
  destination: string;
  childName: string;
  onOrder: () => void;
}) {
  return (
    <section className="kit-showcase" aria-labelledby="kit-showcase-title">
      <div className="kit-showcase-hero">
        <div className="kit-showcase-art">
          <KitIllustration destination={destination} childName={childName} />
        </div>
        <div className="kit-showcase-copy">
          <p className="eyebrow">The explorer kit · {PRODUCTS.kit.priceLabel}</p>
          <h2 id="kit-showcase-title">Open the parcel, and the adventure is already packed.</h2>
          <p>
            We print your {destination} booklet in full colour, add a sticker for every game, seal a mystery
            envelope for the end of the trip, and post it all to your door. No printer, no scissors, no hunting
            for pencils at the airport.
          </p>
          <ul className="kit-perks">
            {kitPerks.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="kit-perk-icon" aria-hidden="true"><Icon size={18} /></span>
                <span><strong>{title}</strong> {text}</span>
              </li>
            ))}
          </ul>
          <button className="primary-button kit-showcase-button" type="button" onClick={onOrder}>
            <Package size={18} />
            Mail me the {destination} kit · {PRODUCTS.kit.priceLabel}
          </button>
          <p className="kit-showcase-note">
            <Truck size={15} aria-hidden="true" />
            {PRODUCTS.kit.note}. Each kit is printed to order and posted within {KIT_SHIPS_WITHIN_DAYS} working days.
          </p>
        </div>
      </div>

      <table className="kit-compare">
        <caption>Free PDF or explorer kit</caption>
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">What you get</span></th>
            <th scope="col">Free PDF</th>
            <th scope="col" className="kit-compare-kit">Explorer kit <span>{PRODUCTS.kit.priceLabel}</span></th>
          </tr>
        </thead>
        <tbody>
          {comparison.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>
                {row.free
                  ? <span className="kit-compare-yes"><Check size={15} aria-hidden="true" /> {row.free}</span>
                  : <span className="kit-compare-no"><Minus size={15} aria-hidden="true" /><span className="sr-only">Not included</span></span>}
              </td>
              <td className="kit-compare-kit">
                <span className="kit-compare-yes"><Check size={15} aria-hidden="true" /> {row.kit}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
