export interface SectionImage {
  src: string;
  alt: string;
  caption: string;
  /** world placement for the floating 3D panel */
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface SectionDef {
  id: string;
  index: string;
  overline: string;
  cn: string;
  mark: string; // watermark brush character
  title: string;
  copy: string;
  note: string;
  chips?: string[];
  /** master-scroll window [start, end] in 0..1 */
  range: [number, number];
  images: SectionImage[];
}

export const SECTIONS: SectionDef[] = [
  {
    id: "hero",
    index: "00",
    overline: "The Living Heritage of the Middle Kingdom",
    cn: "龍威",
    mark: "龍",
    title: "Longwei",
    copy: "",
    note: "",
    range: [0.0, 0.108],
    images: [],
  },
  {
    id: "origins",
    index: "01",
    overline: "Origins",
    cn: "源流",
    mark: "源",
    title: "An Unbroken River of Time",
    copy:
      "While other ancient civilisations rose and vanished, China's current never broke — five millennia flowing from oracle-bone divinations and Shang bronzes straight into the present. Longwei draws from that living stream.",
    note: "Oracle bone script · c. 1250 BCE — Ritual bronze · Shang dynasty",
    range: [0.135, 0.318],
    images: [
      { src: "img/oracle.jpg", alt: "Oracle bone fragment carved with ancient divination script", caption: "Oracle bone script", x: -3.55, y: 0.32, z: -1.8, w: 3.3 },
      { src: "img/bronze.jpg", alt: "Shang dynasty ritual bronze ding vessel", caption: "Ritual bronze ding", x: 3.6, y: -0.35, z: -3.4, w: 3.2 },
    ],
  },
  {
    id: "innovation",
    index: "02",
    overline: "Philosophy & Innovation",
    cn: "巧思",
    mark: "巧",
    title: "Ideas That Moved the World",
    copy:
      "Paper to carry thought. Printing to multiply it. Silk to clothe empires. The compass to steer them. Gunpowder to rewrite their fates — born of a mind that reads the universe as pattern, balance and flow.",
    note: "Bamboo manuscript slips · Sinan lodestone compass",
    chips: ["Paper · 紙", "Printing · 印刷", "Silk · 絲綢", "Compass · 指南", "Gunpowder · 火藥"],
    range: [0.338, 0.488],
    images: [
      { src: "img/manuscript.jpg", alt: "Ancient bamboo slip manuscript with ink calligraphy", caption: "Bamboo manuscript", x: -3.6, y: -0.22, z: -3.2, w: 3.25 },
      { src: "img/compass.jpg", alt: "Han dynasty sinan lodestone compass on bronze plate", caption: "Sinan compass", x: 3.5, y: 0.35, z: -2.2, w: 3.3 },
    ],
  },
  {
    id: "art",
    index: "03",
    overline: "Art & Craft",
    cn: "匠心",
    mark: "藝",
    title: "The Artisan's Breath",
    copy:
      "Jingdezhen kilns fired porcelain whiter than milk, thinner than paper. Calligraphers turned ink into dance — and the ink-wash masters left their mountains mostly unsaid, letting empty silk do the speaking.",
    note: "Blue-and-white porcelain · Ink-wash handscroll",
    range: [0.508, 0.638],
    images: [
      { src: "img/porcelain.jpg", alt: "Blue-and-white porcelain vase painted with a dragon", caption: "Jingdezhen porcelain", x: -3.45, y: 0.3, z: -2.4, w: 3.2 },
      { src: "img/inkwash.jpg", alt: "Ink-wash landscape handscroll, partially unrolled", caption: "Ink-wash scroll", x: 3.65, y: -0.3, z: -1.6, w: 3.35 },
    ],
  },
  {
    id: "architecture",
    index: "04",
    overline: "Architecture & Symbolism",
    cn: "營造",
    mark: "構",
    title: "A Geometry of Heaven",
    copy:
      "Upturned eaves lift roofs like wings; dougong brackets bloom in interlocking tiers. Above the ridge-line the dragon chases its pearl while the phoenix rides the wind — every beam a sentence in a wooden scripture.",
    note: "Imperial roofline · Lantern-lit lattice",
    range: [0.658, 0.756],
    images: [
      { src: "img/roofline.jpg", alt: "Imperial palace roofline with glazed tiles and brackets", caption: "Palace roofline", x: -3.6, y: -0.25, z: -3.0, w: 3.35 },
      { src: "img/lattice.jpg", alt: "Wooden lattice window glowing with lantern light", caption: "Lantern-lit lattice", x: 3.5, y: 0.3, z: -2.0, w: 3.2 },
    ],
  },
  {
    id: "festivals",
    index: "05",
    overline: "Festivals & Living Culture",
    cn: "歲時",
    mark: "慶",
    title: "Still Aflame",
    copy:
      "Each winter the lanterns rise again over the river towns, and drums wake the dragon for another New Year. This heritage is not kept behind glass — it dances.",
    note: "Lantern festival · Dragon dance",
    range: [0.788, 0.898],
    images: [
      { src: "img/lanterns.jpg", alt: "Red and gold lanterns rising into the night sky", caption: "Lantern festival", x: -3.55, y: 0.25, z: -2.2, w: 3.3 },
      { src: "img/dance.jpg", alt: "Dragon dance costume weaving through sparks at night", caption: "Dragon dance", x: 3.55, y: -0.3, z: -3.8, w: 3.2 },
    ],
  },
  {
    id: "finale",
    index: "06",
    overline: "Enter",
    cn: "入",
    mark: "入",
    title: "Enter Longwei",
    copy:
      "The first collection opens soon — three hundred numbered pieces in jade, gold leaf and carved lacquer. Leave your mark; the dragon remembers.",
    note: "Longwei Atelier · MMXXVI",
    range: [0.905, 1.0],
    images: [],
  },
];

export const NAV_LINKS = [
  { label: "Heritage", p: 0.2 },
  { label: "Ingenuity", p: 0.4 },
  { label: "Craft", p: 0.56 },
  { label: "Culture", p: 0.83 },
  { label: "Enter", p: 0.95 },
];

export const ALL_IMAGES = SECTIONS.flatMap((s) => s.images.map((i) => i.src));
