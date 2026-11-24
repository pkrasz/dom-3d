// Paleta gotowych kolorów farb. Same dane – nowy kolor to jeden wpis { name, color } w odpowiedniej grupie.

/** @type {Array<{id: string, name: string, colors: Array<{name: string, color: string}>}>} */
export const PAINT_GROUPS = [
  {
    id: 'biale',
    name: 'Biele',
    colors: [
      { name: 'Biel śnieżna', color: '#ffffff' },
      { name: 'Biel złamana', color: '#f2efe8' },
      { name: 'Biel ciepła', color: '#f6f1e7' },
      { name: 'Biel chłodna', color: '#f1f4f6' },
      { name: 'Alabaster', color: '#efe9dd' },
    ],
  },
  {
    id: 'szarosci',
    name: 'Szarości',
    colors: [
      { name: 'Jasny popiel', color: '#e3e3e1' },
      { name: 'Szary perłowy', color: '#cfd0cf' },
      { name: 'Szary gołębi', color: '#b4b8bb' },
      { name: 'Szary stalowy', color: '#8d9296' },
      { name: 'Grafit', color: '#4a4e53' },
      { name: 'Antracyt', color: '#2f3236' },
    ],
  },
  {
    id: 'beze',
    name: 'Beże',
    colors: [
      { name: 'Kość słoniowa', color: '#efe6d3' },
      { name: 'Piaskowy', color: '#e2d3b8' },
      { name: 'Beż', color: '#d8c7a9' },
      { name: 'Greige', color: '#cfc6b8' },
      { name: 'Cappuccino', color: '#c4ab8b' },
      { name: 'Taupe', color: '#a8998a' },
    ],
  },
  {
    id: 'pastele',
    name: 'Pastele',
    colors: [
      { name: 'Szałwia', color: '#c5d1bd' },
      { name: 'Mięta', color: '#cfe5d8' },
      { name: 'Błękit pastelowy', color: '#cfdfea' },
      { name: 'Lawenda', color: '#d9d3e6' },
      { name: 'Pudrowy róż', color: '#ecd3cf' },
      { name: 'Brzoskwinia', color: '#f3d9c2' },
      { name: 'Wanilia', color: '#f4ecc6' },
    ],
  },
  {
    id: 'mocne',
    name: 'Mocne',
    colors: [
      { name: 'Butelkowa zieleń', color: '#1f4d3f' },
      { name: 'Morski', color: '#1f6f78' },
      { name: 'Granat', color: '#1f2f4a' },
      { name: 'Terakota', color: '#b8603f' },
      { name: 'Musztardowy', color: '#c99a2e' },
      { name: 'Bordo', color: '#6e2433' },
      { name: 'Czarny', color: '#1b1c1e' },
    ],
  },
];

/** Nazwa koloru z palety albo null, gdy to kolor własny. */
export function paintName(color) {
  const c = String(color || '').toLowerCase();
  for (const g of PAINT_GROUPS) for (const p of g.colors) if (p.color === c) return p.name;
  return null;
}
