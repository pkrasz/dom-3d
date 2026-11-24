# Model 3D domu

Interaktywny model 3D domu (parter + poddasze) do planowania wykończenia wnętrz. Działa w przeglądarce, także na telefonie. Three.js + Vite, czysty JavaScript (moduły ES), bez frameworka.

Co potrafi:

- pokazuje dom zbudowany wyłącznie z wymiarów w `house.json` – w rzucie z góry, w orbicie i w spacerze na wysokości oczu,
- pozwala nadać każdej ścianie, podłodze, sufitowi, skosowi i kominowi farbę albo materiał (płytki, deski, jodełka, beton, wykładzina, własne zdjęcie płytki), także „płytki do wysokości”,
- pozwala ustawiać meble z katalogu (kolizje ze ścianami, dosuwanie do ścian, wymiary, kolor),
- trzyma kilka wariantów aranżacji, zapisuje je sam w przeglądarce, eksportuje i importuje jako plik JSON,
- ma gotowe aranżacje całego domu (na razie „Montana”), które dodaje się jednym przyciskiem jako nowy wariant.

## Uruchomienie

Potrzebny Node.js z npm.

```bash
npm install        # raz, po pobraniu projektu
npm run dev        # serwer deweloperski Vite (adres wypisze się w terminalu)
npm test           # testy (vitest run, katalog tests/)
npm run build      # wersja produkcyjna do katalogu dist/
npm run preview    # podgląd zbudowanej wersji z dist/
```

Podgląd na telefonie w tej samej sieci Wi-Fi:

```bash
npm run dev -- --host
```

Vite wypisze wtedy adres `Network: http://192.168.x.x:5173/` – otwórz go w telefonie. (W `vite.config.js` jest już `server: { host: true }`, więc zwykłe `npm run dev` też udostępnia serwer w sieci lokalnej; `--host` niczego nie psuje.)

W trybie deweloperskim obiekt aplikacji jest dostępny w konsoli przeglądarki jako `window.app` (np. `app.variant.get()`, `app.features.variants.exportData('active')`).

## Obsługa w skrócie

### Pasek górny

- **Kondygnacja**: przyciski z nazwami kondygnacji z `house.json` oraz „Cały dom” (tylko w orbicie).
- **Tryb widoku**: „Z góry” (rzut z przekrojem), „Orbita”, „Spacer”.
- **Pomieszczenia** – lista „Skocz do pomieszczenia” z powierzchniami w m².
- **Dach** – pokazuje / ukrywa dach, strop i sufity (przycisk widoczny tylko w orbicie).
- **Dzień / Wieczór** – przełącznik oświetlenia.
- **Meble** i przycisk z nazwą aktywnego **wariantu** – dodawane przez funkcje.

### Sterowanie widokiem

| Tryb | Telefon / tablet | Komputer |
|---|---|---|
| Z góry | 1 palec – przesuwanie, 2 palce – zoom i przesuwanie | lewy lub prawy przycisk – przesuwanie, kółko – zoom |
| Orbita | 1 palec – obrót, 2 palce – zoom i przesuwanie | lewy przycisk – obrót, prawy – przesuwanie, kółko – zoom |
| Spacer | joystick w lewym dolnym rogu – chodzenie, przeciąganie palcem – rozglądanie | W/S/A/D lub strzałki, Q/E – obrót, Shift – szybciej, przeciąganie myszą – rozglądanie |

W spacerze działają kolizje ze ścianami, a po schodach przechodzi się między kondygnacjami.

### Wykończenia

Dotknij (kliknij) ścianę, podłogę, sufit, skos albo komin – otworzy się panel (na telefonie arkusz od dołu) z zakładkami:

- **Farba** – paleta kolorów, własny kolor, ostatnio używane.
- **Materiały** – biblioteka wg kategorii; dla wybranego materiału: format, własny wymiar elementu (cm), obrót 0° / 90°, dla płytek układ prosty / na cegiełkę, szerokość i kolor fugi.
- **Własne** – zdjęcie płytki z dysku lub aparatu (pomniejszane do 512 px), nazwa i wymiar elementu.

Dla ścian, kominów i skosów jest przełącznik „Cała ściana / Płytki do wysokości” (inne wykończenie do podanej wysokości i powyżej). Panel pokazuje pole powierzchni i orientacyjną ilość okładziny z zapasem 10%. Skróty: „Zastosuj do wszystkich ścian pomieszczenia”, „Zastosuj do sufitu i skosów pomieszczenia”, „Przywróć domyślne”.

### Meble

- **Meble** na pasku otwiera katalog. Nowy mebel staje na środku widoku; gdy przy otwartym katalogu dotkniesz podłogi, stanie w dotkniętym miejscu.
- Dotknięcie mebla zaznacza go i otwiera edycję: `−15°`, `+15°`, `90°`, „Do ściany”, „Duplikuj”, „Przenieś tu”, „Usuń”, kolor, wymiary w cm (dla mebli wiszących także „Od podłogi”).
- Zaznaczony mebel przeciąga się palcem / myszą po podłodze (w rzucie i w orbicie, nie w spacerze). Nie przechodzi przez ściany i dociąga się do lica ściany z odległości do 15 cm.
- Dotknięcie obok odznacza mebel. Na inną kondygnację mebel przenosi się tak: przełącz kondygnację i użyj „Przenieś tu”.

### Warianty, eksport, import

Przycisk z nazwą wariantu otwiera panel „Warianty”: lista (przełączanie, zmiana nazwy, usuwanie – ostatniego nie da się usunąć), „Pusty z meblami z projektu”, „Kopia bieżącego”, „Gotowe aranżacje”, „Udostępnij”, „Wyślij plik”, „Wklej link…”, „Eksportuj bieżący”, „Eksportuj wszystkie”, „Importuj z pliku…”.

Zmiany zapisują się same w `localStorage` tej przeglądarki (klucz `model3d-dom`). Plik eksportu (`dom-<nazwa>-RRRR-MM-DD.json`) służy jako kopia zapasowa. Import jednego wariantu od razu go aktywuje; paczka wariantów tylko dopisuje się do listy.

**Gotowe aranżacje.** W sekcji „Nowy wariant” jest grupa „Gotowe aranżacje” – przycisk (np. „Montana”) dodaje przygotowaną aranżację całego domu jako **nowy** wariant i od razu na niego przełącza. Niczego nie nadpisuje: gdy wariant o tej nazwie już jest, nowy dostaje dopisek „(2)”. Po dodaniu to zwykły wariant – można go zmieniać, kopiować, udostępniać i usunąć. Pierwsze uruchomienie w nowej przeglądarce nadal zaczyna od „Wariant 1” z samymi meblami z projektu.

**Wysyłanie wariantu na inny telefon.** „Udostępnij” tworzy link z całym aktywnym wariantem (wykończenia i meble) i otwiera systemowe udostępnianie (albo kopiuje link do schowka). Odbiorca otwiera link, widzi pytanie „Dodać wariant «nazwa»?” i po „Dodaj i otwórz” ma go u siebie jako nowy wariant – jego własne warianty zostają bez zmian. To kopia: późniejsze zmiany trzeba wysłać ponownie, a ten sam link otwarty drugi raz doda kolejną kopię z dopiskiem „(2)”. Każdy, kto ma link, zobaczy ten wariant. Wariant z własnymi zdjęciami płytek (albo wyjątkowo duży) nie mieści się w linku – wtedy „Wyślij plik” i u odbiorcy „Importuj z pliku…”.

Link dodaje wariant w tej przeglądarce, w której się otworzył. Jeśli odbiorca używa ikony na ekranie telefonu (na iPhonie ma ona osobną pamięć niż Safari) albo link otworzył się w oknie komunikatora: skopiować link z wiadomości i w aplikacji wybrać Warianty → „Wklej link…”.

Technicznie: wariant jest zakodowany we fragmencie adresu (`#w=1.z.<dane>`, `features/variants/share.js`), więc nie trafia na żaden serwer; limit to 6000 znaków całego adresu, a dane mają sumę kontrolną (przekłamany link jest odrzucany). Dane z linku przechodzą tę samą walidację co plik importu.

## Jak dodać nowy materiał

### Podłoga, płytka, kamień itp.

Plik: `src/features/finishes/library.js`, tablica `MATERIALS`. Jeden materiał = jeden wpis. Pełna postać:

```js
{
  id: 'gres-oliwkowy',            // unikalny; trafia do wariantów – istniejących id nie zmieniaj
  name: 'Gres oliwkowy',          // nazwa w panelu
  category: 'gres',               // id z CATEGORIES (ten sam plik)
  use: 'both',                    // 'floor' = tylko podłoga | 'wall' = ściana, sufit, skos, komin | 'both'
  size: [0.6, 0.6],               // prawdziwy rozmiar elementu w METRACH: [wzdłuż u, wzdłuż v]
                                  //   ściana: [szerokość, wysokość]; deska: [szerokość, długość]
  colors: ['#8a9078', '#848a72', '#90967e'],  // odcienie losowane na elementy; pierwszy = kolor przewodni
  texture: { draw: 'tiles', look: 'clouds' }, // sposób rysowania – patrz niżej
  grout: { color: '#a9aaa8', width: 0.002 },  // fuga (szerokość w m, najwyżej 0.01); null = bez fugi
  pattern: 'straight',            // 'straight' | 'brick' (cegiełka; działa tylko dla draw: 'tiles')
  formats: 'tile',                // lista formatów z FORMATS proponowana w panelu: 'tile' | 'plank' | 'herringbone' | null
},
```

Wartości `texture.draw`:

- `'tiles'` – prostokąty z fugą (płytki, kamień),
- `'planks'` – deski obok siebie z losowym przesunięciem łączeń (`grout` to szczelina między deskami),
- `'herringbone'` – jodełka; `size` = [szerokość, długość], długość musi być wielokrotnością szerokości,
- `'seamless'` – bez podziału (beton, wykładzina); `size` to okres powtarzania wzoru.

Wartości `texture.look`: `'plain'`, `'clouds'` (przetarcia betonu), `'veins'` (żyłki marmuru), `'speckle'` (lastryko, granit – kolory ziaren w `texture.chips: ['#...', ...]`), `'wood'` (słoje), `'slate'` (warstwy łupka), `'carpet'` (włókno – używane z `'seamless'`), `'patchwork'` (płytka z motywem – gwiazdki, kwiatki), `'brick'` (cegła o nierównych odcieniach), `'oldwood'` (postarzane deski z sękami), `'terrazzo'` (lastryko z okruchami w prawdziwej skali – kolory w `texture.chips`), `'plaster'` (tynk strukturalny – używany z `'seamless'`).

Jodełka z gresu (zamiast drewnianej) ma flagę `texture.tileJoint: true` – rysuje pełną fugę, a panel pokazuje dla niej wybór szerokości i koloru fugi. Listy formatów w `FORMATS` to m.in. `'tile'`, `'plank'`, `'herringbone'`, `'herringboneTile'`, `'board'`, `'brick'`; kategoria „Cegła i tynk” ma id `cegla`.

Krócej – tymi samymi pomocnikami, których używa plik (`wood`, `herringbone`, `laminate`, `tile`, `seamless`):

```js
tile('gres-oliwkowy', 'Gres oliwkowy', 'gres', 'both', [0.6, 0.6], ['#8a9078', '#848a72', '#90967e'], 'clouds', GROUT_GREY),
wood('deska-buk', 'Deska bukowa', ['#d9b48a', '#cfa97e', '#e0bd95', '#c8a073']),
seamless('wykladzina-zielona', 'Wykładzina zielona', 'wykladzina', 'floor', [1, 1], ['#5f7a63', '#56715a', '#68836c'], 'carpet'),
```

Zasady pilnowane przez test (`tests/finishes.test.js`, „biblioteka: unikalne id…”): unikalne `id`, kategoria z `CATEGORIES`, kolory małymi literami w postaci `#rrggbb`, `size` od 0,02 do 3 m, `formats` istniejące w `FORMATS`. Nowa kategoria = wpis w `CATEGORIES` (musi mieć co najmniej jeden materiał). Nowy format do wyboru w panelu = wpis w `FORMATS`. Po zmianie: `npm test`.

### Kolor farby

Plik: `src/features/finishes/palette.js`, tablica `PAINT_GROUPS`. Dopisz do `colors` wybranej grupy:

```js
{ name: 'Oliwka', color: '#8a9078' },   // kolor małymi literami, #rrggbb
```

Gotowe kolory fug są w `library.js` → `GROUT_COLORS`, szerokości fug w `GROUT_WIDTHS_MM`.

### Nowy rodzaj rysowania tekstury

Plik: `src/features/finishes/textures.js`. Tekstury są rysowane na `<canvas>`; UV powierzchni są w metrach, a tekstura obejmuje „komórkę” `nx × ny` elementów.

**Nowy wygląd elementu (`look`)** – najprostsze. W funkcji `drawElement` dopisz gałąź przed końcowym `else` (`'plain'`):

```js
} else if (look === 'stripes') {
  // x, y, w, h – prostokąt elementu w pikselach; rand() – deterministyczny generator 0..1
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = rgba('#000000', 0.04 + rand() * 0.04);
    ctx.fillRect(x + (i / 6) * w, y, w / 12, h);
  }
}
```

i użyj w bibliotece: `texture: { draw: 'tiles', look: 'stripes' }`. `drawElement` obsługuje `'tiles'` i `'planks'`; jodełka zawsze rysuje słoje, a `'seamless'` rozróżnia tylko `'carpet'` i resztę (plamy betonu) – w funkcji `drawSeamless`.

**Nowy układ (`draw`)**, np. heksagony – trzeba dotknąć kilku miejsc:

1. `textures.js` → `textureLayout`: ile elementów ma komórka (`nx`, `ny`) i jaki jest rozmiar elementu siatki; bez nowej gałęzi komórka to jeden element `size`.
2. `textures.js`: nowa funkcja `drawCos(ctx, def, params, L, seed)` rysująca całą komórkę tak, żeby powtarzała się bez szwu, oraz gałąź w `drawMaterial`.
3. `library.js`: dopisz nazwę w komentarzu / typie `MaterialDef` i użyj jej w materiale.
4. `tests/finishes.test.js`: lista dozwolonych wartości `['tiles', 'planks', 'herringbone', 'seamless']` w teście biblioteki.
5. Panel (`panel.js` → `optionsBlock`) sam pokaże format, wymiar i obrót; układ „na cegiełkę” i fugę pokazuje tylko dla `'tiles'` (to samo ograniczenie jest w `finish.js` → `materialParams`).

## Jak dodać nowy mebel

Plik: `src/features/furniture/catalog.js`, tablica `CATALOG`. Jeden mebel = jeden wpis:

```js
{
  id: 'lawka',                    // unikalny; trafia do wariantów jako FurnitureItem.type
  name: 'Ławka',                  // nazwa w katalogu
  category: 'inne',               // id z CATEGORIES (ten sam plik)
  size: { w: 1.2, d: 0.4, h: 0.45 },                              // wymiary domyślne (m)
  range: { w: [0.6, 2.0], d: [0.3, 0.6], h: [0.35, 0.55] },       // dozwolony zakres [min, max] (m)
  color: '#8a623c',               // kolor domyślny, małymi literami
  // mount: 1.45,                 // tylko meble wiszące: wysokość spodu nad posadzką (m)
  build(b, w, d, h) {             // bryła dla AKTUALNYCH wymiarów w, d, h
    b.box(0, 0, h - 0.04, w, d, h, 'main');          // siedzisko
    legs(b, w, d, 0, h - 0.04, 0.05, 0.03, 'dark');  // cztery nogi (pomocnik z tego pliku)
  },
},
```

Układ współrzędnych w `build` – „od narożnika”, metry:

- `x`: 0..`w` od lewej do prawej, patrząc na front mebla,
- `y`: 0..`d` od **frontu** (0) do **tyłu** (`d`); tył to strona dosuwana do ściany,
- `z`: 0..`h` od spodu mebla w górę.

Dostępne kształty:

```js
b.box(x0, y0, z0, x1, y1, z1, mat)   // prostopadłościan od–do
b.cyl(cx, cy, r, z0, z1, mat)        // walec pionowy o środku (cx, cy) i promieniu r
```

`mat` to: `'main'` (kolor mebla wybierany przez użytkownika), `'dark'` / `'light'` (ciemniejszy / jaśniejszy odcień tego koloru) albo kolor stały z `FIXED_COLORS`: `'white'`, `'steel'`, `'black'`, `'blat'`, `'mattress'`, `'glass'` (półprzezroczysty), `'shade'`.

Pomocniki w pliku do wykorzystania: `legs` (nogi), `fronts` (siatka frontów), `cabinet` (szafka z frontami i cokołem), `kitchenBase`, `basin` (niecka), `sofa`, `bed`, `modules` (liczba drzwiczek dla szerokości).

Zasady pilnowane przez test (`tests/furniture.test.js`, „meble – katalog”):

- bryła mieści się w `w × d × h` dla wymiarów domyślnych i skrajnych z `range`,
- bryła faktycznie sięga wysokości `h` i ma szerokość `w` (jakiś kształt musi dotykać `x = 0`, `x = w` i `z = h`),
- najwyżej 24 kształty na mebel,
- `range`: minimum > 0, maksimum ≤ 5 m, a `range.h[1]` ≤ wysokość parteru (2,70 m),
- unikalne `id`, kategoria z `CATEGORIES`, kolor `#rrggbb` małymi literami.

Wymiary pisz względem `w`, `d`, `h` (jak w przykładzie), wtedy mebel poprawnie się skaluje. Nowa kategoria = wpis w `CATEGORIES` (z co najmniej jednym meblem). Paleta kolorów w panelu edycji to `PALETTE`. Po zmianie: `npm test`.

**Meble dwukolorowe i dodatkowe kształty.** Typ może mieć drugi kolor: pola `color2: '#rrggbb'` (domyślny) i `colorNames: ['Fronty', 'Blat']` (podpisy przełącznika w panelu edycji); w bryle używa się wtedy materiałów `'second'`, `'second-dark'`, `'second-light'`. W wariancie drugi kolor to opcjonalne pole mebla `color2` (brak = domyślny typu). Poza `b.box` i `b.cyl` są kształty: `ell` (walec eliptyczny), `tube` (rura / misa), `cylX`, `cylY`, `discY` (walce leżące), `ball` (elipsoida), `beam` (belka skośna między dwoma punktami) – sygnatury i lista `SHAPES` są w nagłówku `catalog.js`.

Mebla zapisanego w wariancie z nieznanym `type` aplikacja nie gubi – rysuje go jako zwykłą skrzynię (`FALLBACK_TYPE`). Dlatego nie zmieniaj `id` typów, które są już użyte w wariantach.

### Meble startowe

Plik: `src/features/furniture/starter.js`, tablica `FROM_PROJECT`. Są tam tylko meble narysowane w projekcie (szafy wnękowe, kominek), jako prostokąty w układzie domu:

```js
{ id: 'start-szafa-wiatrolap', type: 'szafa-wnekowa', levelId: 'parter', rect: [5.3, 2.05, 6.5, 2.65], back: 'N', h: 2.4 },
```

- `rect` = `[x_min, y_min, x_max, y_max]` w metrach (układ `house.json`),
- `back` = strona, przy której stoi tył mebla: `'N'` (góra arkusza, +y), `'S'`, `'W'`, `'E'`,
- `h` = wysokość; wpis na poddaszu bez `h` jest automatycznie dzielony na część pod sufitem płaskim (2,40 m) i pod skosem (1,40 m).

Meble startowe trafiają tylko do **nowo tworzonego** wariantu (pierwsze uruchomienie albo „Pusty z meblami z projektu”). Warianty już zapisane w przeglądarce się nie zmieniają. Położenie tych mebli sprawdzają testy „meble – startowe z projektu” w `tests/furniture.test.js` (część liczb jest tam wpisana wprost) – zmieniając lub usuwając wpis, popraw też test.

## Gotowe aranżacje – jak dodać kolejną

Katalog: `src/features/variants/presets/`. Gotowa aranżacja to zwykły wariant (ten sam kształt co w pliku eksportu) zapisany w kodzie.

1. Dane: moduł z funkcją zwracającą **nowy** obiekt `{ id, name, finishes, furniture, customMaterials: [] }`. „Montana” to `presets/montana.js`, który składa dwa moduły danych: `presets/montana/parter.js` i `presets/montana/poddasze.js` (każdy eksportuje `finishes` i `furniture` swojej kondygnacji). Najprościej zacząć od wariantu ułożonego w aplikacji: „Eksportuj bieżący” i przepisać `finishes` / `furniture` z pliku.
2. Rejestr: jeden wpis w `presets/index.js` → `PRESETS`:

```js
{ id: 'skandynawska', name: 'Skandynawska', description: 'Jedno zdanie pod przyciskiem.', create: createSkandynawska },
```

Przycisk w panelu pojawia się sam. Zasady:

- meble z projektu (`starter.js`) zostają w aranżacji z tymi samymi `id`, położeniem i wymiarami – zmienia się najwyżej kolor,
- bez własnych zdjęć płytek (`customMaterials` puste) – inaczej wariant nie zmieści się w linku,
- `id` materiałów z `library.js`, typy mebli z `catalog.js`, identyfikatory powierzchni z bryły **z `design.json`**.

`tests/presets.test.js` sprawdza każdą aranżację z rejestru: unikalne `id` mebli, typy i zakresy wymiarów z katalogu, brak kolizji ze ścianami, kominami i schodami, wysokość pod sufitem i skosem, istniejące powierzchnie i materiały pasujące do rodzaju powierzchni, walidację importu bez strat, plik i link tam i z powrotem, a na końcu dodanie z panelu w złożonej aplikacji (wszystkie meble w scenie, wszystkie wykończenia nałożone, bez błędów w konsoli). Wymagania konkretnej aranżacji (łuki drzwi, przejścia 80 cm, nakładanie mebli) mają własne testy: `tests/preset.montana.parter.test.js`, `tests/preset.montana.poddasze.test.js`.

Rozmiar: „Montana” (139 wykończeń, 115 mebli) daje link o długości ok. 4700 znaków przy limicie 6000. Test wymaga co najmniej 500 znaków zapasu – gdy aranżacja urośnie ponad to, trzeba odchudzić dane (mniej drobnych mebli, mniej różnych kolorów ścian), a nie podnosić limit.

### „Montana” – świadome kompromisy (do decyzji właściciela)

Tych życzeń nie da się spełnić w całości przy bryle i zabudowach z projektu. Każdy punkt ma liczby z danych wariantu i jest pilnowany testem – zmiana danych bez zmiany opisu nie przejdzie.

- **Biuro 1/3 – zabudowa A i kanapa.** Z zabudów z projektu w biurze została zabudowa A na ścianie zachodniej; zabudowę B przy ścianie od schodów (D-7; x 5,90..7,91) usunięto na życzenie – na tej ścianie, po lewej ręce siedzącego przy biurku, wisi telewizor (tak samo jak szafa w sypialni 1/9, którą zastąpiła toaletka). Dzięki temu przed złożoną kanapą jest pełne **1,40 × 2,00 m** wolnej podłogi (x 6,25..7,65; y 7,00..9,00) – dawny kompromis 1,40 × 1,35 m zniknął. Zostają dwa drobiazgi: kanapa stoi **35 cm** od niskiej części zabudowy A (na odcinku 85 cm z 1,61 m – dostęp do tej szafy jest tam ciasny), a pod telewizorem **nie ma szafki RTV**: w poprzek pokoju jest 2,93 m, kanapa ze strefą zajmuje 2,85 m, więc nawet najpłytsza szafka (30 cm) skróciłaby wolne miejsce do 1,78 m.
- **Parter – ścianka szklana wiatrołapu.** Skrzydła (2 × 90 cm) otwierają się do korytarza. Czynne jest **prawe** (od strony salonu): otwarte leży na ścianie i niczego nie zasłania. **Lewe jest bierne** (na ryglu, otwierane okazjonalnie): otwarte na 90° staje 9 cm przed drzwiami łazienki 0/3 i zasłania 57 z 80 cm ich światła – przy otwartym lewym skrzydle drzwi łazienki się nie otworzą. Konsola w wiatrołapie ma 60 × 25 cm i kończy się 37 cm przed ścianką; obok niej pas w osi czynnego skrzydła ma 74 cm, a ostatnie 37 cm przed skrzydłem pełne 90 cm.
- **Łazienka 1/7 – bidet przy wannie.** Wanna 150 × 80 cm stoi pod skosem przy ścianie nośnej (5 cm luzu) i kończy się 30 cm przed przodem bidetu, więc bok siedzącego jest wolny (min. 37 cm od osi bidetu i WC). Dalej niż 30 cm przed bidetem krawędź wanny biegnie **19 cm od jego osi** (przyjmuje się ok. 40 cm) – miejsce na stopy jest z tej strony węższe. Wzdłuż ściany nie ma zapasu: bidet, WC (osie co 63,5 cm; oś WC 37,5 cm od szafki) i blat dwóch umywalek 1,10 m zajmują ją do końca. Szerzej da się tylko bez bidetu albo z jedną umywalką.
- **Wanna – bateria.** Model pokazuje czarną baterię na rancie wanny od strony ściany (wysokość bryły mebla to rant + bateria, więc rant wypada 6 cm poniżej wpisanej wysokości). Bateria wolnostojąca albo ścienna to decyzja wykonawcza.

## Skąd się bierze geometria

Źródłem geometrii jest `house.json` (projekt) oraz – tylko dla jawnie wpisanych odstępstw – `design.json` (opcje bryły, niżej). Kod w `src/geometry/` buduje z nich ściany, otwory, stropy, schody, skosy i dach; nic nie jest „dorysowane” w kodzie. Wykończenia i meble nigdy nie zmieniają tego pliku (pole `meta.rule`).

Układ współrzędnych (pole `meta.coordinates`): metry; początek (0,0) w lewym-dolnym zewnętrznym narożniku **muru** na rzucie parteru; `x` w prawo arkusza (0..13,60), `y` w górę arkusza (0..10,10), `z` w górę od posadzki parteru ±0,00. Wymiar 14,00 × 10,50 z projektu to obrys z ociepleniem. Wymiary są surowe, bez tynków (`meta.dimensionsAre`). Three.js ma oś Y w górę – przeliczenie jest w `src/app/coords.js` (`toWorld`, `toHouse`).

Główne części pliku: `meta`, `construction`, `levels` (parter i poddasze: `walls`, `openings`, `rooms`, `chimneys`, schody itd.), `roof`, `assumptions`.

**Zasada: nie zgaduj wymiarów.** Każda liczba ma pochodzić z projektu. Pewność odczytu opisuje `meta.confidenceLegend`: `pewne` (liczba wpisana na rysunku), `wyliczone` (z łańcucha wymiarów), `pomiar` (zmierzone ze skali rysunku, ok. 1 cm), `zalozenie` (nie ma w projekcie – przyjęte, do zmiany). Wszystko, czego projekt nie podaje, jest spisane w tablicy `assumptions` – 22 wpisy `A1`–`A22`, każdy z polami `id`, `text`, `affects` (np. wysokość balustrad, kształt szpaletów okien dachowych, uproszczenie dachu). Przyjmując nowe założenie, dopisz je tam. Dodatkowe reguły budowania są w `meta.buildRules`.

### Opcje bryły – `design.json`

`house.json` zostaje wierny projektowi. Decyzje aranżacyjne właściciela, które zmieniają **bryłę**, są w osobnym pliku `design.json` i wszystkie są **założeniami do uzgodnienia z projektantem / konstruktorem** (każda ma pole `note`). Usunięcie opcji z pliku przywraca bryłę z projektu; pusty obiekt `{}` to dokładnie projekt. `src/main.js` przekazuje plik do `createApp({ house, design, … })`; w kodzie jest dostępny jako `app.design`.

| Opcja | Co zmienia |
|---|---|
| `stairs.groundFloorBalustrade: "slats"` + `stairs.slats` (`profile`, `clearGap`, `color`) | zamiast balustrady biegu dolnego czarne pionowe lamele od stopnic do spodu stropu |
| `stairs.slats.continuous: true` | lamele ciągłe przez obie kondygnacje: w duszy od stopnic biegu dolnego w górę i na krawędziach otworu klatki na poddaszu – zamiast wszystkich balustrad; wejście na schody i wyjście na korytarz wolne, prześwit najwyżej `clearGap` |
| `stairs.slats.atticHeight: "handrail"` (wymaga `continuous`) | na poddaszu lamele ucięte na wysokości balustrady z projektu (`stairVoid.balustradeHeight` = 0,90 m) i zakończone czarną poręczą 5 × 4 cm: poziomą na krawędziach otworu klatki (wierzch +3,93) i pochyłą w duszy, równoległą do biegu górnego (0,90 m nad linią nosków, od +2,94 do +3,93; w narożniku przy wyjściu kończy się na bocznym licu poręczy poziomej, x = 7,895 – bryły poręczy się nie przenikają). Parter bez zmian: lamele od stopnic do stropu, a pod otworem klatki przez całą wysokość parteru. Wyjątek widoczny tylko w widoku samego parteru: dwie lamele duszy najbliżej zabiegu (x = 6,37 i 6,50) kończą się pod poręczą pochyłą na +2,94 i +3,03 (ponad spodem stropu +2,70, tuż pod posadzką poddasza), a poręcz, do której dochodzą, należy do poddasza i znika razem z nim. `"ceiling"` albo brak pola = poprzednie zachowanie: wszystkie lamele do sufitu poddasza, bez poręczy. Rzut lameli i kolizje spaceru są w obu wariantach takie same |
| `stairs.treads` (`tread`, `riser`, `thickness`, `nosing`) | dębowe stopnice na jasnych podstopnicach; rzędne schodów bez zmian |
| `openCeiling.rooms` (np. `["1/9", "1/10", "1/11"]`) | pomieszczenia bez sufitu płaskiego – skos do kalenicy, ściany do skosu |
| `openCeiling.beams` (`color`, `enabled`, `collarTies`, `purlins`) | widoczne jętki i płatew w pomieszczeniach otwartych (przekroje i rozstaw przyjęte, nie z projektu więźby) |
| `doors.sliding` (lista: `id`, `level`, `side`, `slide`, opcjonalnie `travel`) + `doors.leaf` (`overlap`, `thickness`, `wallGap`, `open`, `color`, `railColor`) | drzwi wewnętrzne przesuwne „barn”: gładkie ościeża zamiast ościeżnicy, drewniane skrzydło z poprzeczkami i zastrzałami na czarnej szynie po stronie pomieszczenia `side`, odsuwane w kierunku `slide`; dziś DP1, DP2 (sypialnia 1/9) i DW4 (kuchnia – spiżarnia) |
| `extraRoofWindows.windows` (lista: `id`, `room`, `slope`, `x`) + `width`, `length`, `rafters` | dodatkowe okna połaciowe budowane jak okna z projektu (otwór w połaci i skosie, szpalet); dziś 78 × 118 w pokojach 1/4, 1/5, 1/8. `rafters` to rozstaw krokwi przepisany z rysunku więźby – okno ma leżeć między krokwiami, a gdy wymaga przesunięcia krokwi, wpis mówi o tym jawnie (`rafterShift`) |

Skutki dla wariantów: w pomieszczeniach otwartych nie ma powierzchni `…:ceiling`, a sypialnia 1/9 dostaje skosy `poddasze:1/9:slope-N` i `slope-S`. Wykończenia zapisane dla powierzchni, których w bieżącej bryle nie ma, są po prostu niewidoczne (własny zapis) albo pomijane z komunikatem (import, link, gotowa aranżacja). Wysokość pomieszczenia w punkcie – także pod skosem otwartego sufitu – zwraca `app.collision.ceilingAt(levelId, x, y)`. Lamele, belki i drzwi przesuwne są stałymi elementami bryły (nie da się ich zaznaczyć ani przemalować w aplikacji – kolor ustawia `design.json`). Dodatkowe okna połaciowe nie zmieniają identyfikatorów powierzchni, tylko pole skosu. `house.json` (i `app.house`) dalej zawiera wyłącznie okna z projektu.

Drzwi przesuwne a meble: skrzydło jeździ po ścianie, więc przy niej musi zostać wolny pas – cały tor skrzydła plus 5 cm, 12,5 cm od lica ściany. Prostokąty podaje `app.collision.slidingDoors(levelId)` (pole `keepClear`); skrzydło nie należy do `app.collision.walls()`, a przez otwór przechodzi się w spacerze jak przez zwykłe drzwi.

Zmianę opcji sprawdzają `tests/geometry.design.test.js` i `tests/geometry.design2.test.js` (drzwi przesuwne, lamele ciągłe i ich poręcze na poddaszu, okna dodatkowe – m.in. te same warunki, które `tools/check.mjs` stawia oknom z projektu).

Narzędzia (uruchamiane w Node, czytają tylko `house.json`):

```bash
node tools/check.mjs       # kontrola house.json względem liczb przepisanych z projektu
node tools/preview2d.mjs   # podgląd 2D rzutów → preview/parter.html, preview/poddasze.html
```

- `tools/check.mjs` porównuje łańcuchy wymiarowe, wymiary wewnętrzne, powierzchnie i dach z liczbami przepisanymi z rysunków; kończy się kodem 1, gdy coś się nie zgadza.
- `tools/preview2d.mjs` generuje samodzielne pliki HTML z rzutem każdej kondygnacji do porównania z rysunkiem projektu (podkłady: `preview/rys1_podklad.png`, `preview/rys2_podklad.png`).
- `tools/geometry.mjs` to wspólne obliczenia (pola pomieszczeń, prostokąty otworów); korzysta z nich też aplikacja.

Kiedy uruchomić: **po każdej zmianie `house.json`** – najpierw `node tools/check.mjs`, potem `node tools/preview2d.mjs` i obejrzenie rzutu, na końcu `npm test`.

Uwaga: zmiana geometrii może zmienić identyfikatory powierzchni (np. numer ściany w `parter:0/3:wall:2` to indeks krawędzi pomieszczenia). Wykończenia zapisane w wariantach dla powierzchni, które przestały istnieć, nie będą wtedy widoczne.

## Struktura katalogów

```
house.json            geometria domu z projektu – źródło wymiarów
design.json           opcje bryły: jawne odstępstwa od projektu (lamele przy schodach, otwarty sufit z belkami,
                      drzwi przesuwne, dodatkowe okna połaciowe)
index.html            strona startowa
vite.config.js        konfiguracja Vite i testów
src/
  main.js             start: wczytuje house.json, tworzy app, uruchamia funkcje
  app/                rdzeń: app.js (API dla funkcji, opis w JSDoc), store.js (stan + zdarzenia),
                      variant.js (model danych wariantu), coords.js
  geometry/           budowa brył z house.json (ściany, stropy, schody, dach, kolizje)
  render/             renderer, scena, światła, materiały domyślne
  controls/           tryby widoku (viewManager.js), spacer (walkControls.js), dotknięcia (picking.js)
  ui/                 pasek górny, panel, lista pomieszczeń, joystick, komunikaty, style
  features/
    finishes/         wykończenia: library.js, palette.js (dane), textures.js, finish.js, apply.js, panel.js…
    furniture/        meble: catalog.js, starter.js (dane), placement.js, model.js, scene.js, panel.js
    variants/         warianty: controller.js, storage.js, validate.js, io.js, panel.js, share.js (link), receive.js,
                      presets/ (gotowe aranżacje: index.js = rejestr, montana.js + montana/parter.js, poddasze.js)
tools/                check.mjs, preview2d.mjs, geometry.mjs
tests/                testy vitest
preview/              wygenerowane podglądy 2D i podkłady z rysunków
etap1_analiza/        odczyt projektu (źródło liczb w house.json)
```

## Zasady architektury

**Wariant jest źródłem prawdy.** Cały stan aranżacji to jeden obiekt JSON (wariant) w `app.store`. Funkcje nie zmieniają sceny „na boku”: zapisują zmianę przez `app.variant.update(...)`, rdzeń emituje `'variant:change'`, a każda funkcja doprowadza scenę do stanu z wariantu. Dzięki temu przełączenie wariantu, import i wczytanie zapisu działają tą samą drogą.

```js
app.variant.update((draft) => {
  draft.finishes['parter:0/6:floor'] = { kind: 'material', id: 'deska-dab-naturalny', rot: 0 };
});
```

(Wyjątek: podczas przeciągania mebla obiekt jest przesuwany bezpośrednio jako podgląd, a zapis do wariantu następuje raz, po puszczeniu.)

**Funkcje korzystają tylko z API `app`.** Każda funkcja to katalog `src/features/<nazwa>/` z `index.js` eksportującym `init(app)`; `main.js` woła je w kolejności: warianty → wykończenia → meble, a wyniki trafiają do `app.features`. Pełny opis API jest w JSDoc na początku `src/app/app.js`: powierzchnie (`app.surfaces`, `setSurfaceMaterial`), zdarzenia (`app.events`: `'surface:tap'`, `'floor:tap'`, `'object:tap'`, `'background:tap'`, `'level:change'`, `'view:change'`, `'variant:change'`, `'lighting:change'`), interfejs (`app.ui.openPanel`, `addToolbarButton`, `toast`), grupy mebli (`app.furnitureGroup(levelId)`), kolizje (`app.collision`), przeciąganie (`app.picking.setDragHandler`). Tam też opisano, jak funkcje dzielą się dotknięciami (`store.activeTool`, `selection`). Nową funkcję dodaje się jako kolejny katalog w `features/` i wpis na liście w `main.js`.

**Renderowanie na żądanie.** Nie ma stałej pętli animacji – klatka rysuje się tylko po `app.requestRender()`. Po każdej zmianie w scenie trzeba je wywołać. Animacja: `app.addUpdater((dt) => true)` – funkcja wołana przed klatką, `true` oznacza „rysuj dalej”.

**Dane oddzielone od logiki.** Biblioteka materiałów, paleta i katalog mebli to pliki z samymi danymi, bez Three.js i DOM, więc są testowane w Node.

## Format pliku wariantu (JSON)

Plik eksportu:

```json
{
  "app": "model3d-dom",
  "version": 1,
  "exportedAt": "2026-11-24T10:00:00.000Z",
  "variants": [
    {
      "id": "…",
      "name": "Wariant 1",
      "finishes": {
        "parter:0/6:floor": { "kind": "material", "id": "deska-dab-naturalny", "rot": 0 },
        "parter:0/3:wall:2": {
          "kind": "split", "height": 1.2,
          "lower": { "kind": "material", "id": "plytka-biala-30x60", "rot": 0, "pattern": "brick", "grout": "#a9aaa8", "groutWidth": 0.002 },
          "upper": { "kind": "paint", "color": "#f2efe8" }
        }
      },
      "furniture": [
        { "id": "m-1", "type": "sofa-3", "levelId": "parter", "x": 10.2, "y": 6.4, "rot": 90, "w": 2.2, "d": 0.95, "h": 0.85, "color": "#8a8f98" }
      ],
      "customMaterials": [
        { "id": "wlasny-…", "name": "Moja płytka", "dataUrl": "data:image/jpeg;base64,…", "size": [0.6, 0.6] }
      ]
    }
  ]
}
```

- `app`, `version` – znacznik i wersja formatu (`APP_ID`, `CURRENT_VERSION` w `features/variants/validate.js`); plik z nowszą wersją jest odrzucany. Import przyjmuje też sam obiekt wariantu bez nagłówka.
- `finishes` – klucz to identyfikator powierzchni: `poziom:pomieszczenie:floor`, `…:ceiling`, `…:slope-N` / `slope-S`, `…:wall:<indeks>`, `…:chimney:<id>` (pomocnik `surfaceIds` w `src/app/variant.js`). Wartość:
  - `{ kind: 'paint', color }` – farba `#rrggbb`,
  - `{ kind: 'material', id, rot, size?, pattern?, grout?, groutWidth? }` – `id` z biblioteki albo z `customMaterials`; `rot` 0 lub 90; opcjonalnie `size` [szer., wys.] w m, `pattern` `'straight'` / `'brick'`, `grout` kolor fugi, `groutWidth` szerokość fugi w m,
  - `{ kind: 'split', height, lower, upper }` – tylko ściany, kominy i skosy: do `height` (m od podłogi) wykończenie `lower`, wyżej `upper`; bez zagnieżdżania.
  - Powierzchnia bez wpisu ma wygląd domyślny.
- `furniture` – `type` z katalogu, `levelId`, środek `x`, `y` w układzie domu (m), `rot` w stopniach (przeciwnie do wskazówek zegara; przy 0 tył mebla patrzy w +y), `w`, `d`, `h` w m, `color`, opcjonalnie `z` (wysokość spodu nad posadzką – meble wiszące) i `color2` (drugi kolor mebli dwukolorowych, np. blat).
- `customMaterials` – własne płytki: zdjęcie jako `dataUrl` (obraz rastrowy w base64) i wymiar elementu `size` w m.

Przy imporcie dane są czyszczone (`validate.js`): wykończenia powierzchni, których nie ma w tym domu, i meble z nieznanych kondygnacji są pomijane; limity to m.in. 30 wariantów, 500 mebli i 60 własnych materiałów na wariant. W `localStorage` zapis ma postać `{ version, activeId, savedAt, variants }`. Zmiana formatu wymaga podniesienia `CURRENT_VERSION` i wpisu w `MIGRATIONS` w `validate.js`.

## Publikacja i dostęp z telefonu

Aplikacja to statyczna strona: po `npm run build` cały serwis leży w katalogu `dist/` (ok. 1 MB) i nie potrzebuje żadnego serwera z logiką. Ścieżki w `dist/index.html` są względne (`base: './'` w `vite.config.js`), więc strona działa zarówno pod własnym adresem, jak i w podkatalogu (np. `https://uzytkownik.github.io/dom/`).

Dwie rzeczy, o których warto pamiętać:

- **Adres jest publiczny.** Każdy, kto zna link, zobaczy rzuty i wymiary domu. Nie ma w nich adresu ani danych osobowych (nazwę w nagłówku ustawia `house.json` → `meta.name`), ale linku nie warto rozsyłać szerzej niż trzeba.
- **Warianty zapisują się w przeglądarce, osobno dla każdego adresu i urządzenia.** To, co ustawisz na jednym urządzeniu, nie pojawi się samo na drugim. Wariant wysyłasz linkiem: Warianty → „Udostępnij”, a odbiorca otwiera link i potwierdza dodanie (w aplikacji z ikony na ekranie telefonu: Warianty → „Wklej link…”). Link działa między urządzeniami otwierającymi ten sam adres strony. Plik („Wyślij plik” / „Eksportuj wszystkie” → „Importuj z pliku…”) zostaje jako zapas: dla wariantów z własnymi zdjęciami płytek i do przeniesienia wszystkich wariantów naraz.

### A. W domu, przez Wi‑Fi (bez publikacji)

Komputer i telefon muszą być w tej samej sieci.

```bash
npm run dev
```

Vite wypisze adres `Network: http://192.168.x.x:5173/` – wpisz go w przeglądarce telefonu. Działa tak długo, jak długo polecenie jest uruchomione, a komputer nie śpi. Jeśli strona się nie otwiera, zapora systemu (macOS: Ustawienia → Sieć → Zapora sieciowa) musi zezwalać `node` na połączenia przychodzące.

Żeby sprawdzić dokładnie to, co trafi do internetu (wersję zbudowaną), użyj:

```bash
npm run build
```

```bash
npm run preview -- --host
```

### B. Netlify Drop – najprościej, bez gita

1. `npm run build`
2. Wejdź na <https://app.netlify.com/drop> (darmowe konto) i przeciągnij na stronę katalog `dist`.
3. Po kilku sekundach dostajesz adres `https://losowa-nazwa.netlify.app` – nazwę zmienisz w ustawieniach witryny (Site configuration → Change site name).

Aktualizacja: zbuduj ponownie i przeciągnij nowy `dist` w zakładce **Deploys** tej samej witryny. Adres zostaje ten sam, więc warianty zapisane w telefonie też zostają.

### C. Vercel – z terminala

```bash
npm run build
```

```bash
npx vercel deploy dist --prod
```

Pierwsze uruchomienie poprosi o zalogowanie (darmowe konto) i nazwę projektu; kolejne publikacje to te same dwa polecenia.

### D. GitHub Pages – gdy chcesz mieć kod w repozytorium

Katalog `model3d` leży wewnątrz większego repozytorium, więc do publikacji najwygodniej założyć **osobne repozytorium tylko dla tego katalogu**.

1. W katalogu `model3d`: `git init`, `git add .`, `git commit -m "Model 3D domu"` (`node_modules` i `dist` są już w `.gitignore`).
2. Załóż repozytorium na GitHubie i wypchnij: `gh repo create dom-3d --source . --push --public`. GitHub Pages jest darmowe dla repozytoriów publicznych; dla prywatnych wymaga płatnego planu – a publiczne repozytorium oznacza, że widoczny jest także kod i `house.json`.
3. Dodaj plik `.github/workflows/pages.yml` (w tym projekcie już jest):

```yaml
name: Publikacja na GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  actions: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v6
      - uses: actions/upload-pages-artifact@v5
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

4. W repozytorium: Settings → Pages → Source: **GitHub Actions**. Po każdym `git push` strona zbuduje się sama i będzie pod `https://<login>.github.io/dom-3d/`.

### Ikona na ekranie głównym telefonu

Po otwarciu adresu w telefonie: iPhone (Safari) → Udostępnij → „Do ekranu początkowego”; Android (Chrome) → menu ⋮ → „Dodaj do ekranu głównego”. Strona otwiera się wtedy na pełnym ekranie, ale nadal potrzebuje internetu (nie działa offline). Na iPhonie ikona ma własną pamięć wariantów, osobną od Safari: warianty zrobione wcześniej w Safari trzeba do niej przenieść („Eksportuj wszystkie” → „Importuj z pliku…”), a link do wariantu od drugiej osoby wkleić przez Warianty → „Wklej link…”.
