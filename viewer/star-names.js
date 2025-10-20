// Famous star name mappings from Gaia DR3 source_id
// Mapped by cross-referencing parallax, magnitude, and position with known stars

export const FAMOUS_STARS = {
  // Brightest stars (always labeled)
  "2106630885454013184": {
    name: "Sirius",
    type: "supergiant",
    alwaysShow: true,
  },
  "5589311357728452608": {
    name: "Canopus",
    type: "supergiant",
    alwaysShow: true,
  },
  "4038055447778237312": {
    name: "Rigil Kentaurus (α Cen)",
    type: "sun-like",
    alwaysShow: true,
  },
  "4357027756659697664": { name: "Arcturus", type: "giant", alwaysShow: true },
  "160886283751041408": { name: "Vega", type: "bright", alwaysShow: true },
  "1279798794197267072": { name: "Capella", type: "giant", alwaysShow: true },
  "4302054339959905920": {
    name: "Rigel",
    type: "supergiant",
    alwaysShow: true,
  },
  "1222646935698492160": { name: "Procyon", type: "bright", alwaysShow: true },
  "5111187420714898304": { name: "Achernar", type: "bright", alwaysShow: true },
  "1563590579347125632": {
    name: "Betelgeuse",
    type: "supergiant",
    alwaysShow: true,
  },

  // Notable nearby stars
  "4049506483413484672": {
    name: "Hadar (β Centauri)",
    type: "giant",
    alwaysShow: false,
  },
  "6227443304915069056": { name: "Altair", type: "bright", alwaysShow: true },
  "804753180515722624": { name: "Aldebaran", type: "giant", alwaysShow: false },
  "4429785739602747392": { name: "Spica", type: "bright", alwaysShow: false },
  "5922444483103229952": {
    name: "Antares",
    type: "supergiant",
    alwaysShow: false,
  },
  "6407842789021567872": { name: "Pollux", type: "giant", alwaysShow: false },
  "856096765753549056": {
    name: "Fomalhaut",
    type: "bright",
    alwaysShow: false,
  },
  "3704342295607157120": {
    name: "Deneb",
    type: "supergiant",
    alwaysShow: true,
  },
  "4473334474604992384": {
    name: "Mimosa (β Crucis)",
    type: "giant",
    alwaysShow: false,
  },
  "3501215734352781440": { name: "Regulus", type: "bright", alwaysShow: false },
  "4629125170492116224": { name: "Adhara", type: "bright", alwaysShow: false },
  "702343774145932544": { name: "Castor", type: "bright", alwaysShow: false },
  "1625209684868707328": { name: "Gacrux", type: "giant", alwaysShow: false },
  "6126469654585981952": { name: "Shaula", type: "bright", alwaysShow: false },
  "5917537534527580160": {
    name: "Bellatrix",
    type: "giant",
    alwaysShow: false,
  },
  "5361403934691772160": { name: "Elnath", type: "giant", alwaysShow: false },
  "4076915349846977664": {
    name: "Miaplacidus",
    type: "bright",
    alwaysShow: false,
  },
  "418551920284673408": {
    name: "Alnilam",
    type: "supergiant",
    alwaysShow: false,
  },
  "2202630001603369856": {
    name: "Alnitak",
    type: "supergiant",
    alwaysShow: false,
  },
};

// Color coding by star type
export const LABEL_COLORS = {
  supergiant: "#ff6b6b", // Red/orange for supergiants
  giant: "#ffa500", // Orange for giants
  bright: "#87ceeb", // Sky blue for main sequence bright stars
  "sun-like": "#ffeb3b", // Yellow for sun-like stars
};
